import { supabase, state } from './supabase';
import { scrollToBottom, customAlert, customConfirm, customPrompt, closeModal, customToast } from './utils';
import { isSelectionMode, toggleSelectionMode, toggleMessageSelection, deleteSelectedMessages, forwardSelectedMessages, confirmForwardMultiple, selectedMessages } from './selection';
import { openLightbox, closeLightbox, lightboxNext, lightboxPrev } from './lightbox';
import { toggleReactionMenu, toggleReaction, toggleMessageMenu, toggleEmojiMenu, sendEmojiMessage, getNotoEmojiUrl, closeAllMessageMenus, adjustMenuPosition, generateReactionsHtml } from './reactions';

import { broadcastTyping, loadMessages } from "./messages-core";
import { cancelReply } from "./messages-actions";

function stopAllRecordingStreams() {
    if (state.localStream) {
        state.localStream.getTracks().forEach(t => t.stop());
        state.localStream = null;
    }
    if ((state as any).recordStream) {
        (state as any).recordStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        (state as any).recordStream = null;
    }
    if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(t => t.stop());
        state.mediaStream = null;
    }
}

function getSupportedMediaRecorderOptions(type: 'voice' | 'video'): MediaRecorderOptions {
    if (typeof MediaRecorder === 'undefined') return {};
    if (type === 'video') {
        const videoCandidates = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4'
        ];
        for (const mime of videoCandidates) {
            if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mime)) {
                return {
                    mimeType: mime,
                    videoBitsPerSecond: 380000,
                    audioBitsPerSecond: 32000
                };
            }
        }
        return { videoBitsPerSecond: 380000, audioBitsPerSecond: 32000 };
    } else {
        const audioCandidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus'
        ];
        for (const mime of audioCandidates) {
            if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mime)) {
                return {
                    mimeType: mime,
                    audioBitsPerSecond: 32000
                };
            }
        }
        return { audioBitsPerSecond: 32000 };
    }
}

export function cancelRecording() {
    if (state.isRecordingVoice || state.isRecordingVideo) {
        (window as any).isRecordingCancelled = true;
        try {
            if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
                state.mediaRecorder.stop();
            }
        } catch (e) {}
        state.isRecordingVoice = false;
        state.isRecordingVideo = false;
        stopAllRecordingStreams();
        
        // Clear timer
        if ((window as any).recordingTimer) {
            clearInterval((window as any).recordingTimer);
        }
        if ((state as any).animationFrameId) {
            cancelAnimationFrame((state as any).animationFrameId);
        }
        
        // Hide UI
        document.getElementById('recording-ui')?.classList.add('hidden');
        document.getElementById('video-preview-container')?.classList.add('hidden');
        const videoEl = document.getElementById('video-preview') as HTMLVideoElement;
        if (videoEl) videoEl.srcObject = null;
        
        // Reset buttons
        const micBtn = document.getElementById('mic-btn')!;
        const videoBtn = document.getElementById('video-btn')!;
        micBtn.classList.remove('text-red-500', 'animate-pulse', 'bg-red-50', 'hidden');
        micBtn.classList.add('text-gray-400');
        videoBtn.classList.remove('text-red-500', 'animate-pulse', 'bg-red-50', 'hidden');
        videoBtn.classList.add('text-gray-400');
    }
}
export function sendRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        (window as any).isRecordingCancelled = false;
        state.isRecordingVoice = false;
        state.isRecordingVideo = false;
        state.mediaRecorder.stop();
        
        clearInterval((window as any).recordingTimer);
        if ((state as any).animationFrameId) {
            cancelAnimationFrame((state as any).animationFrameId);
        }
        document.getElementById('recording-ui')?.classList.add('hidden');
        
        const micBtn = document.getElementById('mic-btn')!;
        const videoBtn = document.getElementById('video-btn')!;
        micBtn.classList.remove('text-red-500', 'animate-pulse', 'bg-red-50');
        micBtn.classList.add('text-gray-400');
        videoBtn.classList.remove('text-red-500', 'animate-pulse', 'bg-red-50');
        videoBtn.classList.add('text-gray-400');
        micBtn.classList.remove('hidden');
        videoBtn.classList.remove('hidden');
        
        const preview = document.getElementById('video-preview-container');
        if (preview) preview.classList.add('hidden');
        
        const videoEl = document.getElementById('video-preview') as HTMLVideoElement;
        if (videoEl) videoEl.srcObject = null;
        
        stopAllRecordingStreams();
    }
}
export async function switchCamera() {
    if (!state.isRecordingVideo || !state.localStream) return;
    
    const currentFacingMode = (state as any).currentFacingMode || "user";
    const newFacingMode = currentFacingMode === "user" ? "environment" : "user";
    
    try {
        const newVideoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: newFacingMode, width: { ideal: 360 }, height: { ideal: 360 } } 
        });
        
        const newVideoTrack = newVideoStream.getVideoTracks()[0];
        const oldVideoTrack = state.localStream.getVideoTracks()[0];
        
        if (oldVideoTrack) {
            state.localStream.removeTrack(oldVideoTrack);
            oldVideoTrack.stop();
        }
        state.localStream.addTrack(newVideoTrack);
        (state as any).currentFacingMode = newFacingMode;
        
        const videoEl = document.getElementById('video-preview') as HTMLVideoElement;
        videoEl.srcObject = state.localStream;
        videoEl.play().catch(e => console.warn('Error playing video preview:', e));
        
        if (newFacingMode === 'user') {
            videoEl.classList.add('scale-x-[-1]');
        } else {
            videoEl.classList.remove('scale-x-[-1]');
        }
        
    } catch (e) {
        console.error("Camera switch failed", e);
    }
}
export async function toggleRecording(type: 'voice' | 'video') {
    if (state.isTechSupportChat) {
        customToast('В этом чате отключены голосовые сообщения и кружочки.');
        return;
    }
    const micBtn = document.getElementById('mic-btn')!;
    const videoBtn = document.getElementById('video-btn')!;
    const activeBtn = type === 'voice' ? micBtn : videoBtn;
    const inactiveBtn = type === 'voice' ? videoBtn : micBtn;
    const isCurrentlyRecording = type === 'voice' ? state.isRecordingVoice : state.isRecordingVideo;
    
    if (isCurrentlyRecording) {
        (window as any).isRecordingCancelled = false;
        state.mediaRecorder?.stop();
        if(type === 'voice') state.isRecordingVoice = false; else state.isRecordingVideo = false;
        
        if ((window as any).recordingTimer) {
            clearInterval((window as any).recordingTimer);
        }
        if ((state as any).animationFrameId) {
            cancelAnimationFrame((state as any).animationFrameId);
        }
        document.getElementById('recording-ui')?.classList.add('hidden');
        
        activeBtn.classList.remove('text-red-500', 'animate-pulse', 'bg-red-50');
        activeBtn.classList.add('text-gray-400');
        inactiveBtn.classList.remove('hidden');
        stopAllRecordingStreams();
        document.getElementById('video-preview-container')?.classList.add('hidden');
    } else {
        try {
            let stream: MediaStream;
            if (type === 'video') {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: { echoCancellation: true, noiseSuppression: true },
                        video: { facingMode: "user", width: { ideal: 360 }, height: { ideal: 360 } }
                    });
                } catch {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 320 } });
                    stream = new MediaStream([...audioStream.getTracks(), ...videoStream.getTracks()]);
                }
                
                state.localStream = stream;
                (state as any).currentFacingMode = "user";
                
                const videoEl = document.getElementById('video-preview') as HTMLVideoElement;
                videoEl.srcObject = stream;
                videoEl.muted = true;
                videoEl.classList.add('scale-x-[-1]');
                videoEl.play().catch(e => console.warn('Error playing video preview:', e));
                
                document.getElementById('video-preview-container')?.classList.remove('hidden');
                document.getElementById('switch-camera-btn')?.classList.remove('hidden');
                
                const canvasSize = 320;
                const halfSize = 160;
                const canvas = document.createElement('canvas');
                canvas.width = canvasSize;
                canvas.height = canvasSize;
                const ctx = canvas.getContext('2d')!;
                
                const draw = () => {
                    if (videoEl.readyState >= 2) {
                        ctx.clearRect(0, 0, canvasSize, canvasSize);
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(halfSize, halfSize, halfSize, 0, Math.PI * 2);
                        ctx.clip();
                        
                        const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
                        let sx = 0, sy = 0, sWidth = videoEl.videoWidth, sHeight = videoEl.videoHeight;
                        if (videoAspect > 1) {
                            sWidth = videoEl.videoHeight;
                            sx = (videoEl.videoWidth - sWidth) / 2;
                        } else {
                            sHeight = videoEl.videoWidth;
                            sy = (videoEl.videoHeight - sHeight) / 2;
                        }
                        
                        if ((state as any).currentFacingMode === 'user') {
                            ctx.translate(canvasSize, 0);
                            ctx.scale(-1, 1);
                        }
                        
                        ctx.drawImage(videoEl, sx, sy, sWidth, sHeight, 0, 0, canvasSize, canvasSize);
                        ctx.restore();
                    }
                    (state as any).animationFrameId = requestAnimationFrame(draw);
                };
                draw();
                
                const canvasStream = canvas.captureStream(24);
                const recordStream = new MediaStream([...canvasStream.getVideoTracks(), ...stream.getAudioTracks()]);
                (state as any).recordStream = recordStream;
                state.mediaRecorder = new MediaRecorder(recordStream, getSupportedMediaRecorderOptions('video'));
            } else {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true }
                }).catch(() => navigator.mediaDevices.getUserMedia({ audio: true }));
                state.localStream = stream;
                document.getElementById('switch-camera-btn')?.classList.add('hidden');
                state.mediaRecorder = new MediaRecorder(stream, getSupportedMediaRecorderOptions('voice'));
            }
            
            const recordingStartMs = Date.now();
            state.mediaChunks = [];
            state.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) state.mediaChunks.push(e.data); };
            state.mediaRecorder.onstop = async () => {
                if ((window as any).isRecordingCancelled) {
                    (window as any).isRecordingCancelled = false;
                    return;
                }
                
                const targetChatId = state.activeChatId;
                if (!targetChatId) return;

                const recordedDurationSec = Math.max(1, Math.round((Date.now() - recordingStartMs) / 1000));
                const mins = Math.floor(recordedDurationSec / 60);
                const secs = (recordedDurationSec % 60).toString().padStart(2, '0');
                const durationLabel = `${mins}:${secs}`;

                const mimeType = state.mediaRecorder?.mimeType || (type === 'voice' ? 'audio/webm' : 'video/webm');
                const blob = new Blob(state.mediaChunks, { type: mimeType });
                const localPreviewUrl = URL.createObjectURL(blob);
                
                // Instant Optimistic UI with local preview for voice/video circle
                const tempId = 'temp_' + Date.now();
                const list = document.getElementById('messages-list')!;
                const tempDiv = document.createElement('div');
                tempDiv.id = tempId;
                tempDiv.className = `flex flex-col max-w-[85%] md:max-w-[65%] min-w-0 self-end items-end animate-fadeIn`;
                if (type === 'video') {
                    tempDiv.innerHTML = `
                        <div class="relative w-[200px] h-[200px] sm:w-[240px] sm:h-[240px] rounded-full overflow-hidden shadow-md border-2 border-blue-400/50">
                            <video src="${localPreviewUrl}" autoplay muted loop playsinline class="w-full h-full object-cover"></video>
                            <div class="absolute inset-0 bg-black/25 flex flex-col items-center justify-center text-white">
                                <svg class="w-8 h-8 animate-spin mb-1" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                <span class="text-[11px] font-semibold drop-shadow">${durationLabel}</span>
                            </div>
                        </div>`;
                } else {
                    tempDiv.innerHTML = `
                        <div class="bg-[#e3f2fd] dark:bg-blue-900/40 text-gray-900 dark:text-gray-100 rounded-[18px] rounded-br-[4px] p-2.5 px-3.5 shadow-sm border border-blue-200/60 dark:border-blue-800/50 flex items-center gap-3 min-w-[200px]">
                            <div class="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
                                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="text-xs font-semibold text-blue-600 dark:text-blue-300">Отправка голосового...</div>
                                <div class="text-[11px] text-gray-500 dark:text-gray-400">${durationLabel}</div>
                            </div>
                        </div>`;
                }
                list.appendChild(tempDiv);
                scrollToBottom(true);

                const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
                const file = new File([blob], `${Date.now()}_${type}.${ext}`, { type: mimeType });
                const replySnap = state.replyingTo ? { ...state.replyingTo } : null;
                const forwardSnap = state.forwardingMsg ? { ...state.forwardingMsg } : null;
                cancelReply();

                try {
                    const { uploadToCloudinary, cacheLocalMediaBlob } = await import('./utils');
                    const fileUrl = await uploadToCloudinary(file);
                    cacheLocalMediaBlob(fileUrl, blob);
                    
                    const mediaArr: any[] = [{ url: fileUrl, type: mimeType, size: blob.size, duration: recordedDurationSec }];
                    
                    if (replySnap) {
                        mediaArr.push({
                            type: 'reply',
                            original_id: replySnap.id,
                            original_content: replySnap.content,
                            original_sender: replySnap.senderName
                        });
                    }
                    
                    if (forwardSnap) {
                        mediaArr.push({
                            type: 'forward',
                            original_id: forwardSnap.id,
                            original_content: forwardSnap.content,
                            original_sender: forwardSnap.senderName
                        });
                    }

                    const { data: insertedData, error: insertError } = await supabase.from('messages').insert({
                        chat_id: targetChatId,
                        sender_id: state.currentUser.id,
                        content: '',
                        media: mediaArr,
                        message_type: type === 'voice' ? 'voice' : 'video_circle',
                        parent_id: replySnap ? replySnap.id : null
                    }).select('*, profiles(*)').single();

                    URL.revokeObjectURL(localPreviewUrl);
                    document.getElementById(tempId)?.remove();

                    if (insertError) {
                        customAlert('Ошибка отправки сообщения');
                    } else {
                        // Immediately render inserted message and broadcast to chat participants
                        const coreMod = await import('./messages-core');
                        const chatMod = await import('./chat');
                        const supaMod = await import('./supabase');
                        if (insertedData && state.activeChatId === targetChatId) {
                            if (!coreMod.currentMessages.some((m: any) => m.id === insertedData.id)) {
                                const nextMsgs = [...coreMod.currentMessages, insertedData];
                                const { saveCachedMessages } = await import('./cache');
                                saveCachedMessages(targetChatId, nextMsgs);
                                coreMod.renderMessages(nextMsgs, false);
                            } else {
                                coreMod.loadMessages(targetChatId);
                            }
                        }
                        chatMod.loadChats();
                        supaMod.broadcastUpdate(targetChatId, 'message');

                        // Push Notification Logic in background
                        let senderName = state.currentProfile?.display_name || state.currentProfile?.username || state.currentUser?.user_metadata?.full_name;
                        if (!senderName) {
                            const { data: p } = await supabase.from('profiles').select('display_name, username').eq('id', state.currentUser.id).single();
                            if (p) senderName = p.display_name || p.username;
                        }
                        senderName = senderName || "Vibegram";
                        
                        const rawBodyContent = type === 'voice' ? '🎤 Голосовое сообщение' : '📹 Видеосообщение';
                        
                        const isGroup = state.activeChatIsGroup;
                        const isChannel = state.activeChatType === 'channel';
                        const groupName = document.getElementById('current-chat-name')?.innerText || 'Группа';
                        
                        const pushTitle = isGroup ? groupName : senderName;
                        const pushBody = isGroup && !isChannel ? `${senderName}: ${rawBodyContent}` : rawBodyContent;
                        const pushData = { chatId: String(targetChatId) };
                        
                        const pushPayloadBase = { 
                            title: pushTitle, 
                            body: pushBody,
                            chat_id: String(targetChatId),
                            text: rawBodyContent,
                            sender_name: senderName,
                            data: pushData
                        };
                        
                        if (!state.activeChatIsGroup && state.activeChatOtherUser) {
                            const otherUserId = state.activeChatOtherUser.user_id || state.activeChatOtherUser.id;
                            supabase.from('profiles').select('push_token').eq('id', otherUserId).single().then(({ data }) => {
                                if (data?.push_token) {
                                    supabase.functions.invoke('send-push', {
                                        body: { token: data.push_token, ...pushPayloadBase }
                                    }).catch(e => console.warn('Push error', e));
                                }
                            });
                        } else if (state.activeChatIsGroup) {
                            supabase.from('chat_members').select('user_id').eq('chat_id', targetChatId).then(({ data: members }) => {
                                if (members) {
                                    const memberIds = members.map((m: any) => m.user_id).filter((id: string) => id !== state.currentUser?.id);
                                    if (memberIds.length > 0) {
                                        supabase.from('profiles').select('push_token').in('id', memberIds).then(({ data: profiles }) => {
                                            if (profiles) {
                                                const tokens = profiles.map((p: any) => p.push_token).filter((t: any) => t);
                                                if (tokens.length > 0) {
                                                    supabase.functions.invoke('send-push', {
                                                        body: { tokens: tokens, ...pushPayloadBase }
                                                    }).catch(e => console.warn('Group Push error', e));
                                                }
                                            }
                                        });
                                    }
                                }
                            });
                        }
                    }
                } catch(err) {
                    console.error(err);
                    URL.revokeObjectURL(localPreviewUrl);
                    document.getElementById(tempId)?.remove();
                    customAlert('Ошибка загрузки медиа');
                }
                if ((state as any).recordStream) {
                    (state as any).recordStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
                }
                if (state.localStream) {
                    state.localStream.getTracks().forEach(track => track.stop());
                }
            };
            state.mediaRecorder.start(250);
            if(type === 'voice') state.isRecordingVoice = true; else state.isRecordingVideo = true;
            
            broadcastTyping(type === 'voice' ? 'recording_voice' : 'recording_video');
            
            // Show UI and start timer
            document.getElementById('recording-ui')?.classList.remove('hidden');
            let seconds = 0;
            const timeEl = document.getElementById('recording-time')!;
            timeEl.textContent = '0:00';
            (window as any).recordingTimer = setInterval(() => {
                seconds++;
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                timeEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            }, 1000);
            
            activeBtn.classList.remove('text-gray-400'); activeBtn.classList.add('text-red-500', 'animate-pulse', 'bg-red-50');
            inactiveBtn.classList.add('hidden');
        } catch (e) { customAlert(`Нет доступа к ${type === 'voice' ? 'микрофону' : 'камере'}.`); }
    }
}
