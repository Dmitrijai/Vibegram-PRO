import { supabase, state } from './supabase';
import { scrollToBottom, customAlert, customConfirm, customPrompt, closeModal, customToast } from './utils';
import { isSelectionMode, toggleSelectionMode, toggleMessageSelection, deleteSelectedMessages, forwardSelectedMessages, confirmForwardMultiple, selectedMessages } from './selection';
import { openLightbox, closeLightbox, lightboxNext, lightboxPrev } from './lightbox';
import { toggleReactionMenu, toggleReaction, toggleMessageMenu, toggleEmojiMenu, sendEmojiMessage, getNotoEmojiUrl, closeAllMessageMenus, adjustMenuPosition, generateReactionsHtml } from './reactions';

import { broadcastTyping, loadMessages } from "./messages-core";
import { cancelReply } from "./messages-actions";
export function cancelRecording() {
    if (state.isRecordingVoice || state.isRecordingVideo) {
        state.mediaRecorder?.stop();
        state.isRecordingVoice = false;
        state.isRecordingVideo = false;
        if(state.localStream) { state.localStream.getTracks().forEach(t => t.stop()); state.localStream = null; }
        
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
        
        // Reset buttons
        const micBtn = document.getElementById('mic-btn')!;
        const videoBtn = document.getElementById('video-btn')!;
        micBtn.classList.remove('text-red-500', 'animate-pulse', 'bg-red-50', 'hidden');
        micBtn.classList.add('text-gray-400');
        videoBtn.classList.remove('text-red-500', 'animate-pulse', 'bg-red-50', 'hidden');
        videoBtn.classList.add('text-gray-400');
        
        // We need to prevent the onstop handler from sending the message.
        // We can set a flag.
        (window as any).isRecordingCancelled = true;
    }
}
export function sendRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        (window as any).isRecordingCancelled = false;
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
        
        if (state.mediaStream) {
            state.mediaStream.getTracks().forEach(t => t.stop());
            state.mediaStream = null;
        }
    }
}
export async function switchCamera() {
    if (!state.isRecordingVideo || !state.localStream) return;
    
    const currentFacingMode = (state as any).currentFacingMode || "user";
    const newFacingMode = currentFacingMode === "user" ? "environment" : "user";
    
    try {
        const newVideoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: newFacingMode, width: 400, height: 400 } 
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
    if (state.isTechSupportChat) return alert('В этом чате отключены голосовые сообщения и кружочки.');
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
        if(state.localStream) { state.localStream.getTracks().forEach(t => t.stop()); state.localStream = null; }
        document.getElementById('video-preview-container')?.classList.add('hidden');
    } else {
        try {
            let stream: MediaStream;
            if (type === 'video') {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 400, height: 400 } });
                
                stream = new MediaStream([...audioStream.getTracks(), ...videoStream.getTracks()]);
                state.localStream = stream;
                (state as any).currentFacingMode = "user";
                
                const videoEl = document.getElementById('video-preview') as HTMLVideoElement;
                videoEl.srcObject = stream;
                videoEl.muted = true;
                videoEl.classList.add('scale-x-[-1]');
                videoEl.play().catch(e => console.warn('Error playing video preview:', e));
                
                document.getElementById('video-preview-container')?.classList.remove('hidden');
                document.getElementById('switch-camera-btn')?.classList.remove('hidden');
                
                const canvas = document.createElement('canvas');
                canvas.width = 400;
                canvas.height = 400;
                const ctx = canvas.getContext('2d')!;
                
                const draw = () => {
                    if (videoEl.readyState >= 2) {
                        ctx.clearRect(0, 0, 400, 400);
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(200, 200, 200, 0, Math.PI * 2);
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
                            ctx.translate(400, 0);
                            ctx.scale(-1, 1);
                        }
                        
                        ctx.drawImage(videoEl, sx, sy, sWidth, sHeight, 0, 0, 400, 400);
                        ctx.restore();
                    }
                    (state as any).animationFrameId = requestAnimationFrame(draw);
                };
                draw();
                
                const canvasStream = canvas.captureStream(30);
                const recordStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
                (state as any).recordStream = recordStream;
                state.mediaRecorder = new MediaRecorder(recordStream, { mimeType: 'video/webm' });
            } else {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                state.localStream = stream;
                document.getElementById('switch-camera-btn')?.classList.add('hidden');
                state.mediaRecorder = new MediaRecorder(stream);
            }
            
            state.mediaChunks = [];
            state.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) state.mediaChunks.push(e.data); };
            state.mediaRecorder.onstop = async () => {
                if ((window as any).isRecordingCancelled) {
                    (window as any).isRecordingCancelled = false;
                    return;
                }
                
                const mimeType = state.mediaRecorder?.mimeType || (type === 'voice' ? 'audio/webm' : 'video/webm');
                const blob = new Blob(state.mediaChunks, { type: mimeType });
                
                // Optimistic UI for voice/video
                const tempId = 'temp_' + Date.now();
                const list = document.getElementById('messages-list')!;
                const tempDiv = document.createElement('div');
                tempDiv.id = tempId;
                tempDiv.className = `flex flex-col max-w-[85%] md:max-w-[65%] min-w-0 self-end items-end animate-fadeIn opacity-70`;
                tempDiv.innerHTML = `<div class="bg-[#e3f2fd] text-gray-900 rounded-[18px] rounded-br-[4px] p-2 px-3 shadow-sm border border-gray-200/60 max-w-full"><div class="text-xs text-blue-500 mb-1">Загрузка ${type === 'voice' ? 'голосового' : 'видео'}...</div><div class="text-[11px] font-medium text-blue-500 mt-1 flex justify-end items-center float-right ml-4 pt-1">Отправка...</div><div class="clear-both"></div></div>`;
                list.appendChild(tempDiv);
                scrollToBottom(true);

                const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
                const file = new File([blob], `${Date.now()}_${type}.${ext}`, { type: mimeType });
                
                try {
                    const { uploadToCloudinary } = await import('./utils');
                    const fileUrl = await uploadToCloudinary(file);
                    
                    let mediaArr = [{ url: fileUrl, type: mimeType, size: blob.size }];
                    
                    if (state.replyingTo) {
                        mediaArr.push({
                            type: 'reply',
                            original_id: state.replyingTo.id,
                            original_content: state.replyingTo.content,
                            original_sender: state.replyingTo.senderName
                        } as any);
                    }
                    
                    if (state.forwardingMsg) {
                        mediaArr.push({
                            type: 'forward',
                            original_id: state.forwardingMsg.id,
                            original_content: state.forwardingMsg.content,
                            original_sender: state.forwardingMsg.senderName
                        } as any);
                    }

                    const { error: insertError } = await supabase.from('messages').insert({
                        chat_id: state.activeChatId, sender_id: state.currentUser.id, content: '',
                        media: mediaArr,
                        message_type: type === 'voice' ? 'voice' : 'video_circle',
                        parent_id: state.replyingTo ? state.replyingTo.id : null
                    });
                    if (insertError) {
                        document.getElementById(tempId)?.remove();
                        customAlert('Ошибка отправки сообщения');
                    } else {
                        document.getElementById(tempId)?.remove();
                        cancelReply();
                        import('./messages-core').then(m => m.loadMessages(state.activeChatId!));
                    }
                } catch(err) {
                    console.error(err);
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
            state.mediaRecorder.start();
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
