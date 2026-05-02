import { supabase, state } from './supabase';
import { scrollToBottom, customAlert, customConfirm, customPrompt, closeModal, customToast, confirmPaidMessageModal } from './utils';
import { isSelectionMode, toggleSelectionMode, toggleMessageSelection, deleteSelectedMessages, forwardSelectedMessages, confirmForwardMultiple, selectedMessages, updateSelectionUI } from './selection';
import { openLightbox, closeLightbox, lightboxNext, lightboxPrev } from './lightbox';
import { toggleReactionMenu, toggleReaction, toggleMessageMenu, toggleEmojiMenu, sendEmojiMessage, getNotoEmojiUrl, closeAllMessageMenus, adjustMenuPosition, generateReactionsHtml } from './reactions';

import { getMediaObserver, clearFile } from "./messages-media";
import { cancelReply } from "./messages-actions";

export let currentMessageLimit = 50;
export let isLoadingMore = false;
export let hasMoreMessages = true;
export let messageScrollListener: any = null;
export let typingTimeout: any = null;

export async function markMessagesAsRead(chatId: string) {
    if (state.isAdminStatus) return;

    // Optimistically update UI
    const unreadBadge = document.querySelector(`#chats-list > div[data-chat-id="${chatId}"] .bg-blue-500.text-white.rounded-full`);
    if (unreadBadge) {
        unreadBadge.remove();
    }
    
    if (state.activeChatId === chatId) {
        const counter = document.getElementById('unread-floating-counter');
        if (counter) {
            counter.classList.add('hidden');
        }
    }

    // Fetch unread messages to track who read them
    const { data: unreadMsgs } = await supabase.from('messages')
        .select('id, reactions')
        .eq('chat_id', chatId)
        .neq('sender_id', state.currentUser.id);

    if (unreadMsgs && unreadMsgs.length > 0) {
        const msgsToUpdate = unreadMsgs.filter(m => {
            const reads = m.reactions?.['__read__'] || [];
            return !reads.includes(state.currentUser.id);
        });

        if (msgsToUpdate.length > 0) {
            const batch = msgsToUpdate.slice(-50);
            await Promise.all(batch.map(msg => {
                const newReactions = { ...(msg.reactions || {}) };
                if (!newReactions['__read__']) newReactions['__read__'] = [];
                if (!newReactions['__read__'].includes(state.currentUser.id)) {
                    newReactions['__read__'].push(state.currentUser.id);
                }
                return supabase.from('messages').update({ 
                    is_read: true,
                    reactions: newReactions
                }).eq('id', msg.id);
            }));
        }
    }

    const { error } = await supabase.from('messages').update({ is_read: true }).eq('chat_id', chatId).neq('sender_id', state.currentUser.id).eq('is_read', false);
    if (!error) {
        if ((window as any).logic?.loadChats) {
            (window as any).logic.loadChats();
        }
        import('./supabase').then(s => s.broadcastUpdate(chatId, 'read'));
    }
}
function renderContent(content: string) {
    if (!content) return '';
    
    const stripped = content.replace(/[\p{Emoji}\s]/gu, '');
    const isOnlyEmoji = stripped.length === 0 && content.trim().length > 0;
    
    const emojiMatches = content.match(/[\p{Emoji}]/gu);
    const emojiCount = emojiMatches ? emojiMatches.length : 0;

    if (isOnlyEmoji && emojiCount > 0 && emojiCount <= 3) {
        let html = '';
        const segments = content.split(/([\p{Emoji}])/gu);
        for (const seg of segments) {
            if (!seg) continue;
            if (seg.match(/[\p{Emoji}]/gu)) {
                html += `<img src="${getNotoEmojiUrl(seg)}" alt="${seg}" loading="lazy" class="w-24 h-24 sm:w-32 sm:h-32 object-contain drop-shadow-xl hover:scale-110 transition-transform" onerror="this.onerror=null; this.outerHTML='<span class=\\'text-6xl\\'>${seg}</span>';">`;
            } else {
                html += seg;
            }
        }
        return `<div class="flex gap-2 justify-center py-2">${html}</div>`;
    }
    
    return `<p class="break-words [word-break:break-word] leading-relaxed whitespace-pre-wrap" style="font-size: var(--msg-text-size, 15px);">${content}</p>`;
}

function setupMessageScrollListener() {
    const list = document.getElementById('messages-list');
    if (!list) return;
    
    if (messageScrollListener) {
        list.removeEventListener('scroll', messageScrollListener);
    }
    
    messageScrollListener = async () => {
        if (list.scrollTop < 50 && !isLoadingMore && hasMoreMessages) {
            isLoadingMore = true;
            currentMessageLimit += 50;
            await loadMessages(state.activeChatId!);
            isLoadingMore = false;
        }
    };
    
    list.addEventListener('scroll', messageScrollListener);
}
export async function loadMessagesUntil(chatId: string, targetMsgId: string) {
    customToast('Поиск сообщения...');
    try {
        // Find the date of the target message
        const { data: targetMsg } = await supabase.from('messages').select('created_at').eq('id', targetMsgId).single();
        if (!targetMsg) return false;
        
        // Count how many messages are newer than the target message
        const { count } = await supabase.from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chatId)
            .gte('created_at', targetMsg.created_at);
            
        if (count !== null) {
            currentMessageLimit = Math.max(currentMessageLimit, count + 20); // Load enough to show it + some context
            await loadMessages(chatId, false);
            return true;
        }
    } catch (e) {
        console.error('Error loading until message:', e);
    }
    return false;
}
export async function loadMessages(chatId: string, isInitialLoad = false) {
    if (isInitialLoad) {
        currentMessageLimit = 50;
        hasMoreMessages = true;
        setupMessageScrollListener();
    }
    try {
        const { data: messages, error } = await supabase.from('messages')
            .select('*, profiles(username, display_name, is_premium, premium_until)')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(currentMessageLimit);
            
        if (error) throw error;
        
        if (messages) {
            hasMoreMessages = messages.length === currentMessageLimit;
            renderMessages(messages.reverse(), isInitialLoad);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        const list = document.getElementById('messages-list')!;
        list.innerHTML = '<div class="flex h-full items-center justify-center"><div class="bg-red-500/80 text-white px-5 py-2 rounded-full text-sm font-medium backdrop-blur-md shadow-lg">Ошибка загрузки сообщений</div></div>';
    }
}
export function renderMessages(messages: any[], isInitialLoad = false) {
    const list = document.getElementById('messages-list')!;
    
    const isScrolledUp = !isInitialLoad && (Math.abs(list.scrollHeight - list.scrollTop - list.clientHeight) > 20);
    
    // Find the first visible message to act as a visual anchor
    let anchorElement: HTMLElement | null = null;
    let anchorOffset = 0;
    const previousScrollHeight = list.scrollHeight;
    const previousScrollTop = list.scrollTop;

    if (isScrolledUp) {
        const children = Array.from(list.children) as HTMLElement[];
        for (let child of children) {
            if (child.id && child.id.startsWith('msg-wrapper-')) {
                // Determine if this element is near the top of the viewport
                const offset = child.offsetTop - list.scrollTop;
                if (offset >= -50) { // Slight negative threshold to catch partially hidden elements
                    anchorElement = child;
                    anchorOffset = offset;
                    break;
                }
            }
        }
    }

    if (isInitialLoad) {
        list.innerHTML = '';
    }

    if (messages.length === 0) {
        list.innerHTML = '<div class="flex h-full items-center justify-center"><div class="bg-black/40 text-white px-5 py-2 rounded-full text-sm font-medium backdrop-blur-md shadow-lg">Здесь пока пусто. Напишите первым!</div></div>';
        return;
    }

    if (list.children.length === 1 && list.children[0].textContent?.includes('Здесь пока пусто')) {
        list.innerHTML = '';
    }

    const existingIds = new Set();
    Array.from(list.children).forEach(child => {
        if (child.id && child.id.startsWith('msg-wrapper-')) {
            existingIds.add(child.id.replace('msg-wrapper-', ''));
        }
    });

    messages.forEach(msg => existingIds.delete(msg.id.toString()));

    existingIds.forEach(id => {
        const div = document.getElementById(`msg-wrapper-${id}`);
        if (div) div.remove();
    });

    messages.forEach((msg, i) => {
        const isMe = msg.sender_id === state.currentUser.id;
        
        let fileHtml = '';
        let replyHtml = '';
        let forwardHtml = '';
        const mediaArr = msg.media || [];
        
        const actualMedia = mediaArr.filter((m: any) => m.type !== 'reply' && m.type !== 'forward' && m.type !== 'admin_mode');
        const replyData = mediaArr.find((m: any) => m.type === 'reply');
        const forwardData = mediaArr.find((m: any) => m.type === 'forward');
        const adminModeData = mediaArr.find((m: any) => m.type === 'admin_mode');

        if (replyData) {
            replyHtml = `
                <div class="flex items-center gap-2 mb-1.5 pl-2 border-l-2 border-blue-500 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-r transition-colors" onclick="document.getElementById('msg-${replyData.original_id}')?.scrollIntoView({behavior: 'smooth', block: 'center'})">
                    <div class="flex-1 min-w-0">
                        <div class="text-[13px] font-medium text-blue-500 dark:text-blue-400">${replyData.original_sender}</div>
                        <div class="text-[13px] text-gray-500 dark:text-gray-400 truncate">${replyData.original_content}</div>
                    </div>
                </div>
            `;
        }

        if (forwardData) {
            forwardHtml = `
                <div class="text-[12px] text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>
                    Переслано от: <span class="font-medium">${forwardData.original_sender}</span>
                </div>
            `;
        }
        
        if (msg.message_type === 'poll' && actualMedia.length > 0) {
            const pollData = actualMedia[0];
            const totalVotes = pollData.options.reduce((sum: number, opt: any) => sum + opt.votes.length, 0);
            
            let optionsHtml = '';
            pollData.options.forEach((opt: any) => {
                const percent = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                const isVoted = state.currentUser ? opt.votes.includes(state.currentUser.id) : false;
                
                optionsHtml += `
                    <div class="relative mb-2 cursor-pointer group" onclick="votePoll('${msg.id}', '${opt.id}')">
                        <div class="absolute inset-0 bg-blue-100 dark:bg-blue-900/30 rounded-lg overflow-hidden">
                            <div class="h-full bg-blue-200 dark:bg-blue-800/50 transition-all duration-500" style="width: ${percent}%"></div>
                        </div>
                        <div class="relative flex justify-between items-center p-2.5 z-10">
                            <div class="flex items-center gap-2">
                                <div class="w-4 h-4 rounded-full border-2 ${isVoted ? 'border-blue-500 bg-blue-500' : 'border-gray-400 group-hover:border-blue-400'} flex items-center justify-center transition-colors">
                                    ${isVoted ? '<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>' : ''}
                                </div>
                                <span class="text-sm font-medium text-gray-800 dark:text-gray-200">${opt.text}</span>
                            </div>
                            <span class="text-xs font-semibold text-gray-500 dark:text-gray-400">${percent}%</span>
                        </div>
                    </div>
                `;
            });
            
            let votersBtn = '';
            if (!pollData.anonymous && totalVotes > 0) {
                votersBtn = `<button onclick="showPollVoters('${msg.id}')" class="text-xs text-blue-500 hover:underline mt-2 block w-full text-center">Кто проголосовал</button>`;
            }

            fileHtml = `
                <div class="w-[260px] sm:w-[300px] bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700 shadow-sm mb-1">
                    <div class="flex items-center gap-2 mb-3">
                        <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                        <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">${pollData.anonymous ? 'Анонимный опрос' : 'Опрос'}</span>
                    </div>
                    <h4 class="font-bold text-gray-900 dark:text-white mb-3 text-[15px] leading-tight">${pollData.question}</h4>
                    <div class="poll-options">
                        ${optionsHtml}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 mt-2 text-right">
                        Всего голосов: ${totalVotes}
                    </div>
                    ${votersBtn}
                </div>
            `;
        } else if (msg.message_type === 'voice' && actualMedia.length > 0) {
            const transcriptionText = actualMedia[0].transcription ? `<div class="mt-1 text-sm text-gray-700 dark:text-gray-200 bg-black/5 dark:bg-white/5 p-2 rounded-lg">${actualMedia[0].transcription}</div>` : '';
            const transcribeBtn = !actualMedia[0].transcription ? `<button id="transcribe-btn-${msg.id}" onclick="transcribeMedia('${actualMedia[0].url}', '${msg.id}')" class="w-7 h-7 shrink-0 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full flex items-center justify-center transition-colors ml-1" title="Расшифровать"><span class="text-[10px] font-bold">Aa</span></button>` : '';
            
            fileHtml = `
                <div class="flex flex-col mb-1">
                    <div class="flex items-center">
                        <div class="audio-player-container flex items-center gap-2 w-[200px] sm:w-[240px] bg-blue-500/10 dark:bg-blue-500/20 p-1.5 rounded-full">
                            <button onclick="toggleAudio(this, '${actualMedia[0].url}')" class="w-9 h-9 shrink-0 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors shadow-sm">
                                <svg class="w-4 h-4 ml-0.5 play-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                <svg class="w-4 h-4 pause-icon hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                            </button>
                            <div class="flex-1 h-1 bg-blue-200 dark:bg-blue-900/50 rounded-full relative overflow-hidden cursor-pointer media-progress-container">
                                <div class="absolute left-0 top-0 h-full bg-blue-500 progress-bar" style="width: 0%"></div>
                            </div>
                            <span class="text-[11px] font-medium text-blue-600 dark:text-blue-400 w-8 text-right time-display">0:00</span>
                        </div>
                        ${transcribeBtn}
                    </div>
                    ${transcriptionText}
                </div>
            `;
        } else if (msg.message_type === 'video_circle' && actualMedia.length > 0) {
            const transcriptionText = actualMedia[0].transcription ? `<div class="mt-1 text-sm text-gray-700 dark:text-gray-200 bg-black/5 dark:bg-white/5 p-2 rounded-lg max-w-[200px]">${actualMedia[0].transcription}</div>` : '';
            const transcribeBtn = !actualMedia[0].transcription ? `<button id="transcribe-btn-${msg.id}" onclick="transcribeMedia('${actualMedia[0].url}', '${msg.id}')" class="absolute bottom-0 right-0 w-8 h-8 bg-gray-800/70 hover:bg-gray-800 text-white rounded-full flex items-center justify-center transition-colors z-10 backdrop-blur-sm" title="Расшифровать"><span class="text-[11px] font-bold">Aa</span></button>` : '';

            fileHtml = `
                <div class="flex flex-col mb-1 items-end">
                    <div class="relative">
                        <div class="video-circle-container uninteracted" onclick="handleVideoCircleClick(event, this)">
                            <video src="${actualMedia[0].url}" loop muted playsinline data-autoplay="true" ontimeupdate="updateVideoProgress(this)" onerror="this.onerror=null; this.parentElement.outerHTML='<div class=\\'w-[200px] h-[200px] rounded-full bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center text-gray-400 text-xs p-4 text-center border border-gray-200 dark:border-gray-700\\'><svg class=\\'w-8 h-8 mb-2 text-red-400\\' fill=\\'none\\' stroke=\\'currentColor\\' viewBox=\\'0 0 24 24\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z\\'></path></svg>Кружок поврежден</div>';"></video>
                            <svg class="video-progress-ring" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="48" stroke-linecap="round"></circle>
                            </svg>
                            <div class="video-overlay-icon flex items-center justify-center">
                                <svg class="w-8 h-8 ml-0.5 play-icon hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                <svg class="w-8 h-8 pause-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                            </div>
                        </div>
                        ${transcribeBtn}
                    </div>
                    ${transcriptionText}
                </div>
            `;
        } else if (actualMedia.length === 1 && actualMedia[0].type?.startsWith('audio/')) {
            const file = actualMedia[0];
            fileHtml = `
                <div class="audio-player-container flex items-center gap-3 w-[240px] sm:w-[280px] bg-black/5 dark:bg-white/5 p-2 rounded-xl mb-1 border border-black/5 dark:border-white/5">
                    <button onclick="toggleAudio(this, '${file.url}')" class="w-10 h-10 shrink-0 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors shadow-sm">
                        <svg class="w-5 h-5 ml-0.5 play-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        <svg class="w-5 h-5 pause-icon hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    </button>
                    <div class="flex-1 min-w-0 flex flex-col justify-center">
                        <div class="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate w-full mb-1">${file.name || 'Аудио'}</div>
                        <div class="flex items-center gap-2">
                            <div class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden cursor-pointer media-progress-container">
                                <div class="absolute left-0 top-0 h-full bg-blue-500 progress-bar" style="width: 0%"></div>
                            </div>
                            <span class="text-[10px] font-medium text-gray-500 dark:text-gray-400 w-8 text-right time-display">0:00</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (actualMedia.length > 0) {
            fileHtml = '<div class="flex flex-wrap gap-1 mb-1.5 w-full">';
            actualMedia.forEach((file: any) => {
                let aspectCls = 'aspect-[4/3] max-w-[200px] sm:max-w-[260px]'; // fallback
                if (file.ratio === '16/9') aspectCls = 'aspect-[16/9] max-w-[240px] sm:max-w-[300px]';
                else if (file.ratio === '9/16') aspectCls = 'aspect-[9/16] max-w-[140px] sm:max-w-[180px]';
                else if (file.ratio === '1/1') aspectCls = 'aspect-square max-w-[180px] sm:max-w-[220px]';

                if(file.type?.startsWith('image/') && !file.asFile) {
                    fileHtml += `<img data-src="${file.url}" loading="lazy" class="${aspectCls} w-full rounded-xl object-cover cursor-pointer hover:opacity-95 shadow-sm border border-black/5 chat-media-item bg-gray-200 dark:bg-gray-800" onclick="openLightbox('${file.url}')" onload="const l=this.closest('#messages-list'); if(l && l.scrollHeight - l.scrollTop - l.clientHeight < 250) l.scrollTop = l.scrollHeight;" onerror="this.onerror=null; this.outerHTML='<div class=\\'${aspectCls} w-full bg-gray-100 dark:bg-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-400 text-xs p-4 text-center border border-gray-200 dark:border-gray-700\\'><svg class=\\'w-8 h-8 mb-2 text-red-400\\' fill=\\'none\\' stroke=\\'currentColor\\' viewBox=\\'0 0 24 24\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z\\'></path></svg>Файл поврежден</div>';">`;
                } else if(file.type?.startsWith('video/') && !file.asFile) {
                    fileHtml += `
                        <div class="relative ${aspectCls} w-full rounded-xl overflow-hidden shadow-sm border border-black/5 group chat-media-item-container mb-1 bg-gray-800">
                            <video src="${file.url}" preload="metadata" class="w-full h-full object-cover chat-media-item cursor-pointer" onclick="toggleInlineVideo(this)" onloadeddata="const l=this.closest('#messages-list'); if(l && l.scrollHeight - l.scrollTop - l.clientHeight < 250) l.scrollTop = l.scrollHeight;" onloadedmetadata="this.parentElement.querySelector('.video-time').textContent = Math.floor(this.duration / 60) + ':' + Math.floor(this.duration % 60).toString().padStart(2, '0')" onerror="this.onerror=null; this.parentElement.outerHTML='<div class=\\'${aspectCls} w-full bg-gray-100 dark:bg-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-400 text-xs p-4 text-center border border-gray-200 dark:border-gray-700\\'><svg class=\\'w-8 h-8 mb-2 text-red-400\\' fill=\\'none\\' stroke=\\'currentColor\\' viewBox=\\'0 0 24 24\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z\\'></path></svg>Видео повреждено</div>';"></video>
                            <div class="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none video-overlay">
                                <div class="w-12 h-12 bg-black/50 rounded-full flex items-center justify-center text-white backdrop-blur-sm">
                                    <svg class="w-6 h-6 ml-0.5 play-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                    <svg class="w-6 h-6 pause-icon hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                </div>
                            </div>
                            <div class="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onclick="event.stopPropagation(); openLightbox('${file.url}')" class="w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white backdrop-blur-sm transition-colors" title="Открыть на весь экран">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                                </button>
                            </div>
                            <div class="absolute bottom-0 left-0 right-0 h-1.5 bg-black/30 cursor-pointer media-progress-container" onclick="event.stopPropagation()">
                                <div class="h-full bg-blue-500 video-progress-bar progress-bar" style="width: 0%"></div>
                            </div>
                            <div class="absolute bottom-2 left-2 text-[10px] text-white bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm video-time">0:00</div>
                        </div>
                    `;
                } else {
                    fileHtml += `<a href="${file.url}" target="_blank" class="flex items-center gap-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 p-3 rounded-xl transition-colors border border-black/5 dark:border-white/5 w-full min-w-0 overflow-hidden"><div class="bg-blue-500 text-white p-2.5 rounded-lg shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div><div class="flex-1 min-w-0"><span class="truncate font-semibold text-sm block w-full">${file.name || 'Файл'}</span><span class="text-xs opacity-70 mt-0.5 block">${file.size ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : ''}</span></div></a>`;
                }
            });
            fileHtml += '</div>';
        }

        const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let ticks = '';
        if (isMe) {
            if (msg.is_read) {
                ticks = `<svg class="w-4 h-4 ml-1 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 6L8.5 14.5L5 11"/><path d="M22 6L14.5 14.5L12 11.5"/></svg>`;
            } else {
                ticks = `<svg class="w-4 h-4 ml-1 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
            }
        }

        let displaySenderName = msg.profiles?.display_name || msg.profiles?.username || 'User';
        let isSystemAdmin = false;
        
        if (state.activeChatType === 'group' || state.activeChatType === 'channel') {
             // Let any message marked with admin_mode explicitly denote a system admin message
             if (adminModeData) {
                 isSystemAdmin = true;
             } else {
                 const isMember = state.activeChatMembers?.some((m: any) => m.user_id === msg.sender_id);
                 if (!isMember && msg.profiles?.settings?.is_tech_support && msg.sender_id !== state.currentUser.id) {
                     isSystemAdmin = true;
                 }
             }
        }
        
        if (msg.profiles?.settings?.is_tech_support && !state.currentProfile?.settings?.is_tech_support && window.location.hash.includes('TECH_SUPPORT_CHAT')) {
            displaySenderName = 'Служба поддержки';
        } else if (isSystemAdmin) {
            displaySenderName = 'Системный администратор';
        }

        const isPremium = msg.profiles?.is_premium && (!msg.profiles.premium_until || new Date(msg.profiles.premium_until) > new Date());
        const premiumBadge = isPremium ? `<span class="inline-flex items-center justify-center ml-1" title="Vibegram Premium"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-3.5 h-3.5 object-contain" alt="Premium"></span>` : '';

        const senderNameHtml = (state.activeChatType === 'group' && (!isMe || isSystemAdmin)) ? `<div class="text-[13px] font-bold text-blue-500 mb-0.5 flex items-center">${displaySenderName}${premiumBadge}</div>` : '';
        
        const encodedContent = encodeURIComponent(msg.content || '').replace(/'/g, "%27");
        
        // Reactions HTML
        let reactionsHtml = generateReactionsHtml(msg.id, msg.reactions);

        const deleteBtnHtml = `
            <div class="relative ml-1 -mr-1 flex items-center">
                <button onclick="toggleReactionMenu(event, '${msg.id}')" class="hidden md:block text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5 rounded-full transition-opacity opacity-0 group-hover:opacity-100 mr-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </button>
                <button onclick="toggleMessageMenu(event, '${msg.id}')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5 rounded-full transition-opacity opacity-50 hover:opacity-100">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                </button>
                <div id="reaction-menu-${msg.id}" class="reaction-menu-dropdown absolute bottom-full ${isMe ? 'right-0' : 'left-0'} mb-1 hidden bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50 px-2 py-1 gap-1 flex-wrap w-max max-w-[330px]">
                    <!-- Emojis will be loaded dynamically on click -->
                </div>
                <div id="msg-menu-${msg.id}" class="msg-menu-dropdown absolute bottom-full ${isMe ? 'right-0' : 'left-0'} mb-1 hidden flex-col bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 w-48 py-1">
                    <div id="msg-info-${msg.id}" class="hidden flex-col px-4 py-2 border-b border-gray-100 dark:border-gray-700 mb-1">
                        <div class="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">Информация</div>
                        <div id="msg-info-content-${msg.id}" class="text-sm text-gray-800 dark:text-gray-200">Загрузка...</div>
                    </div>
                    <button onclick="event.stopPropagation(); closeAllMessageMenus(); if(window.setIgnoreNextClick) window.setIgnoreNextClick(true); toggleSelectionMode(true); toggleMessageSelection('${msg.id}');" class="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                        Выбрать
                    </button>
                    <button onclick="event.stopPropagation(); copyMessageText(decodeURIComponent('${encodedContent}'))" class="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        Копировать
                    </button>
                    ${document.getElementById('input-area')?.style.display !== 'none' ? `
                    <button onclick="event.stopPropagation(); closeAllMessageMenus(); replyToMessage('${msg.id}', decodeURIComponent('${encodedContent}'), '${displaySenderName}')" class="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>
                        Ответить
                    </button>
                    ` : ''}
                    <button onclick="event.stopPropagation(); closeAllMessageMenus(); forwardMessage('${msg.id}', decodeURIComponent('${encodedContent}'), '${displaySenderName}')" class="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"></path></svg>
                        Переслать
                    </button>
                    ${actualMedia.length > 0 && msg.message_type !== 'poll' ? `
                    <button onclick="event.stopPropagation(); closeAllMessageMenus(); handleDownloadMessageMedia('${encodeURIComponent(JSON.stringify(actualMedia))}')" class="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Скачать
                    </button>
                    ` : ''}
                    ${isMe && !state.isAdminStatus ? `
                    <div class="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
                    ${!(msg.media || []).some((m: any) => m.type === 'forward') ? `
                    <button onclick="event.stopPropagation(); editMessage('${msg.id}', decodeURIComponent('${encodedContent}'))" class="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        Изменить
                    </button>
                    ` : ''}
                    <button onclick="event.stopPropagation(); deleteMessage('${msg.id}')" class="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center gap-3">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        Удалить
                    </button>
                    ` : ''}
                    <div class="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
                    <button onclick="event.stopPropagation(); closeAllMessageMenus(); if(window.setIgnoreNextClick) window.setIgnoreNextClick(true); toggleSelectionMode(true); toggleMessageSelection('${msg.id}')" class="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Выбрать
                    </button>
                </div>
            </div>
        `;

        const innerHTML = `
            <div class="relative group select-none ${isMe ? 'bg-[#e3f2fd] dark:bg-blue-900/40 text-gray-900 dark:text-gray-100 rounded-[18px] rounded-br-[4px]' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-[18px] rounded-bl-[4px]'} p-2 px-3 shadow-sm border border-gray-200/60 dark:border-gray-700/60 max-w-full" id="msg-${msg.id}" ontouchstart="handleMessageTouchStart(event, '${msg.id}')" ontouchend="handleMessageTouchEnd(event)" ontouchmove="handleMessageTouchMove(event)" onmousedown="handleMessageTouchStart(event, '${msg.id}')" onmouseup="handleMessageTouchEnd(event)" onmousemove="handleMessageTouchMove(event)" onmouseleave="handleMessageTouchEnd(event)">
                ${forwardHtml}
                ${replyHtml}
                ${senderNameHtml} ${fileHtml}
                ${renderContent(msg.content)}
                <div id="reactions-container-${msg.id}">${reactionsHtml}</div>
                <div class="text-[11px] font-medium ${isMe ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'} mt-1 flex justify-end items-center float-right ml-4 pt-1">
                    ${time} ${ticks}
                    ${deleteBtnHtml}
                </div>
                <div class="clear-both"></div>
            </div>
        `;

        let div = document.getElementById(`msg-wrapper-${msg.id}`);
        if (!div) {
            div = document.createElement('div');
            div.id = `msg-wrapper-${msg.id}`;
            div.className = `msg-wrapper relative flex flex-col max-w-[85%] md:max-w-[65%] min-w-0 ${isMe ? 'self-end items-end' : 'self-start items-start'} animate-fadeIn`;
            div.innerHTML = innerHTML;
            (div as any)._generatedHtml = innerHTML;
            div.onclick = (e) => {
                if (isSelectionMode) {
                    const sel = window.getSelection();
                    if (sel && sel.toString().trim() !== '') return;
                    e.preventDefault();
                    e.stopPropagation();
                    toggleMessageSelection(msg.id);
                }
            };
        } else {
            if ((div as any)._generatedHtml !== innerHTML) {
                div.innerHTML = innerHTML;
                (div as any)._generatedHtml = innerHTML;
            }
            div.onclick = (e) => {
                if (isSelectionMode) {
                    const sel = window.getSelection();
                    if (sel && sel.toString().trim() !== '') return;
                    e.preventDefault();
                    e.stopPropagation();
                    toggleMessageSelection(msg.id);
                }
            };
        }
        
        if (list.children[i] !== div) {
            list.insertBefore(div, list.children[i] || null);
        }
    });

    const observer = getMediaObserver();
    list.querySelectorAll('video, img[data-src]').forEach(v => {
        observer.observe(v);
    });

    list.style.opacity = '1'; // Ensure it's visible in case it was previously hidden
    
    if (isInitialLoad) {
        const scrollState = state.activeChatId ? state.chatScrollPositions.get(state.activeChatId) : undefined;
        let shouldStickToBottom = true;
        let stickAnchorId: string | null = null;
        let stickAnchorOffset = 0;

        if (scrollState) {
            if (typeof scrollState === 'number') {
                shouldStickToBottom = scrollState === -1;
            } else if (scrollState.type === 'bottom') {
                shouldStickToBottom = true;
            } else if (scrollState.type === 'anchor') {
                shouldStickToBottom = false;
                stickAnchorId = scrollState.id;
                stickAnchorOffset = scrollState.offset;
            }
        }

        const applyScrollPosition = () => {
            if (shouldStickToBottom) {
                // If the user has intentionally scrolled up since we started sticking, we may want to stop?
                // Let's just blindly push them down if they meant to be at the bottom, unless they scrolled significantly.
                // Wait, if it's initial load, they haven't scrolled yet.
                if (list) list.scrollTop = list.scrollHeight;
                setTimeout(() => {
                    if (list && list.scrollHeight - list.scrollTop - list.clientHeight < 300) {
                        list.scrollTop = list.scrollHeight;
                    }
                }, 100);
            } else if (stickAnchorId) {
                const anchor = document.getElementById(stickAnchorId);
                if (anchor && list.contains(anchor)) {
                    list.scrollTop = anchor.offsetTop - stickAnchorOffset;
                } else if (typeof scrollState === 'number') {
                    // Fallback to old behavior
                    list.scrollTop = list.scrollHeight - scrollState;
                } else {
                    // If anchor not found (e.g. older messages not loaded yet), stay at the top
                    // so user can fetch older messages
                    list.scrollTop = 0;
                }
            }
        };

        applyScrollPosition();
        
        // Apply once more next frame if layout changed
        requestAnimationFrame(() => applyScrollPosition());

        if (shouldStickToBottom) {
            hideUnreadFloatingCounter();
        } else {
            updateUnreadFloatingCounter(messages);
        }
    } else if (isScrolledUp) {
        const applyScrollPos = () => {
             if (anchorElement && list.contains(anchorElement)) {
                 list.scrollTop = anchorElement.offsetTop - anchorOffset;
             } else {
                 list.scrollTop = list.scrollHeight - previousScrollHeight + previousScrollTop;
             }
        };
        applyScrollPos();
        updateUnreadFloatingCounter(messages);
    } else {
        if (list) list.scrollTop = list.scrollHeight; // Use instant scroll to prevent jumping when re-rendering
        hideUnreadFloatingCounter();
        setTimeout(() => {
            if (list && list.scrollHeight - list.scrollTop - list.clientHeight < 300) {
                list.scrollTop = list.scrollHeight;
            }
        }, 100);
    }
    
    if (isSelectionMode) {
        updateSelectionUI();
    }
}
function updateUnreadFloatingCounter(messages: any[]) {
    let counter = document.getElementById('unread-floating-counter');
    if (!counter) {
        counter = document.createElement('div');
        counter.id = 'unread-floating-counter';
        counter.className = 'absolute bottom-20 right-6 bg-blue-500 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:bg-blue-600 transition-colors z-40 animate-bounce';
        counter.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg><span id="unread-floating-count" class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full"></span>`;
        counter.onclick = () => {
            scrollToBottom(true);
            hideUnreadFloatingCounter();
            if (state.activeChatId) {
                markMessagesAsRead(state.activeChatId);
            }
        };
        document.getElementById('chat-area')?.appendChild(counter);
    }
    
    const unreadCount = messages.filter(m => !m.is_read && m.sender_id !== state.currentUser.id).length;
    if (unreadCount > 0) {
        counter.classList.remove('hidden');
        document.getElementById('unread-floating-count')!.textContent = unreadCount.toString();
    } else {
        counter.classList.add('hidden');
    }
}

function hideUnreadFloatingCounter() {
    const counter = document.getElementById('unread-floating-counter');
    if (counter) counter.classList.add('hidden');
}

export function broadcastTyping(action: string = 'typing') {
    if (state.isTechSupportChat) return;
    if (!state.chatChannel || !state.currentUser) return;
    
    state.chatChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
            userId: state.currentUser.id,
            userName: state.isAdminStatus ? 'Системный администратор' : (state.currentProfile?.display_name || state.currentProfile?.username || 'User'),
            action: action
        }
    });
}
export function handleInput() {
    const input = document.getElementById('message-input') as HTMLTextAreaElement;
    if (!input) return;
    input.style.height = ''; input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    
    if (input.scrollHeight > 120) {
        input.classList.remove('scrollbar-hide');
    } else {
        input.classList.add('scrollbar-hide');
    }
    
    const hasContent = !!input.value.trim() || state.selectedFiles.length > 0 || !!state.forwardingMsg;
    const isAiMode = input.value.trimStart().startsWith('@ai ');
    
    document.getElementById('ai-generate-btn')!.classList.toggle('hidden', !isAiMode);
    document.getElementById('send-btn')!.classList.toggle('hidden', !hasContent || isAiMode);
    
    document.getElementById('mic-btn')!.classList.toggle('hidden', hasContent);
    document.getElementById('video-btn')!.classList.toggle('hidden', hasContent);
    document.getElementById('emoji-btn')?.classList.toggle('hidden', hasContent);
    
    if (input.value.trim()) {
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            broadcastTyping('typing');
        }, 500);
    }
}
const getMediaAspectRatio = (file: File): Promise<string> => {
    return new Promise((resolve) => {
        if ((file as any).asFile) {
            resolve('1:1');
            return;
        }
        if (file.type.startsWith('image/')) {
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                const r = img.width / img.height;
                if (r > 1.2) resolve('16/9');
                else if (r < 0.8) resolve('9/16');
                else resolve('1/1');
            };
            img.onerror = () => resolve('1/1');
            img.src = URL.createObjectURL(file);
        } else if (file.type.startsWith('video/')) {
            const vid = document.createElement('video');
            vid.onloadedmetadata = () => {
                URL.revokeObjectURL(vid.src);
                const r = vid.videoWidth / vid.videoHeight;
                if (r > 1.2) resolve('16/9');
                else if (r < 0.8) resolve('9/16');
                else resolve('1/1');
            };
            vid.onerror = () => resolve('1/1');
            vid.src = URL.createObjectURL(file);
        } else {
            resolve('1/1');
        }
    });
};

export async function sendMessage() {
    if(!state.activeChatId) return;
    const input = document.getElementById('message-input') as HTMLTextAreaElement;
    if (!input) return;
    const text = input.value.trim();
    const files = [...state.selectedFiles];
    if(!text && files.length === 0) return;
    
    // Check Paid Messages feature
    if (!state.activeChatIsGroup && state.activeChatOtherUser && !state.isTechSupportChat && !state.isAdminStatus) {
        // Find if target user is premium and has a price set
        const targetIsPremium = state.activeChatOtherUser.is_premium && (!state.activeChatOtherUser.premium_until || new Date(state.activeChatOtherUser.premium_until) > new Date());
        const iAmPremium = state.currentProfile?.is_premium && (!state.currentProfile?.premium_until || new Date(state.currentProfile?.premium_until) > new Date());
        const price = state.activeChatOtherUser.settings?.paid_message_price || 0;
        
        // If I am NOT premium and target is premium with a price set
        if (!iAmPremium && targetIsPremium && price > 0) {
            const bal = state.currentProfile?.vib_balance || 0;
            if (bal < price) {
                customAlert(`Этот пользователь включил Платные Сообщения.\nУ вас недостаточно VIB для отправки сообщения.\nСтоимость: ${price} VIB.\nВаш баланс: ${bal} VIB.`);
                return;
            }
            
            // Show custom modal instead of browser confirm
            confirmPaidMessageModal(price, state.activeChatOtherUser.display_name || state.activeChatOtherUser.username, async () => {
                // Proceed to pay
                try {
                    const { error } = await supabase.rpc('transfer_vib', { 
                        receiver_id: state.activeChatOtherUser.user_id || state.activeChatOtherUser.id, 
                        amount: price, 
                        note: 'Платное сообщение' 
                    });
                    if (error) {
                        if (error.message.includes('not exist')) {
                             await supabase.rpc('transfer_vib', { receiver_id: state.activeChatOtherUser.user_id || state.activeChatOtherUser.id, amount: price });
                             try {
                                await supabase.from('vib_transfers').insert({ sender_id: state.currentUser.id, receiver_id: state.activeChatOtherUser.user_id || state.activeChatOtherUser.id, amount: price, message: 'Платное сообщение' });
                             } catch(er) {}
                        } else throw error;
                    }
                    
                    // Refresh our local balance
                    state.currentProfile.vib_balance = bal - price;
                    
                    // Call sendMessage recursively but this time we skip the check by passing a flag or just repeating the core
                    // But simpler is to move core logic to a function or just re-trigger with price check disabled
                    actuallySend(text, files, input);
                } catch (err: any) {
                    customAlert('Не удалось оплатить сообщение: ' + err.message);
                }
            });
            return;
        }
    }
    
    actuallySend(text, files, input);
}

async function actuallySend(text: string, files: File[], input: HTMLTextAreaElement) {
    input.value = ''; input.style.height = '';
    clearFile();
    
    // Optimistic UI
    const tempId = 'temp_' + Date.now();
    const list = document.getElementById('messages-list')!;
    const tempDiv = document.createElement('div');
    tempDiv.id = tempId;
    tempDiv.className = `flex flex-col max-w-[85%] md:max-w-[65%] min-w-0 self-end items-end animate-fadeIn opacity-70`;
    tempDiv.innerHTML = `
        <div class="bg-[#e3f2fd] dark:bg-blue-900/40 text-gray-900 dark:text-gray-100 rounded-[18px] rounded-br-[4px] p-2 px-3 shadow-sm border border-gray-200/60 dark:border-gray-700/60 relative group max-w-full">
            ${files.length > 0 ? `<div class="text-xs text-blue-500 dark:text-blue-400 mb-1">Загрузка файлов (${files.length})...</div>` : ''}
            ${renderContent(text)}
            <div class="text-[11px] font-medium text-blue-500 dark:text-blue-400 mt-1 flex justify-end items-center float-right ml-4 pt-1">Отправка...</div>
            <div class="clear-both"></div>
            <button onclick="cancelSend('${tempId}')" class="absolute -left-10 top-1/2 -translate-y-1/2 bg-red-100 dark:bg-red-900/50 text-red-500 dark:text-red-400 p-1.5 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-red-200 dark:hover:bg-red-900/80" title="Отменить отправку">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>`;
    list.appendChild(tempDiv);
    scrollToBottom(true);

    // Store abort controller to allow cancellation
    const abortController = new AbortController();
    (window as any).pendingUploads = (window as any).pendingUploads || {};
    (window as any).pendingUploads[tempId] = abortController;

    try {
        let mediaArr: any[] = [];
        if(files.length > 0) {
            const { uploadToCloudinary } = await import('./utils');
            const uploadPromises = files.map(async (file) => {
                if (abortController.signal.aborted) throw new Error('Upload cancelled');
                const ratio = await getMediaAspectRatio(file as File);
                const url = await uploadToCloudinary(file as File, false, abortController.signal);
                return { url, name: file.name, size: file.size, type: file.type, asFile: (file as any).asFile, ratio };
            });
            mediaArr = (await Promise.all(uploadPromises)).filter(r => r !== null);
        }

        if (abortController.signal.aborted) throw new Error('Upload cancelled');

        if (state.replyingTo) {
            mediaArr.push({
                type: 'reply',
                original_id: state.replyingTo.id,
                original_content: state.replyingTo.content,
                original_sender: state.replyingTo.senderName
            });
        }
        
        if (state.forwardingMsg) {
            mediaArr.push({
                type: 'forward',
                original_id: state.forwardingMsg.id,
                original_content: state.forwardingMsg.content,
                original_sender: state.forwardingMsg.senderName
            });
        }
        
        if (state.isAdminStatus) {
            mediaArr.push({
                type: 'admin_mode'
            });
        }

        const actualMediaCount = files.length;
        let messageType = 'text';
        if (actualMediaCount > 0) {
            if (mediaArr[0].type?.startsWith('image/') && !mediaArr[0].asFile) messageType = 'photo';
            else if (mediaArr[0].type?.startsWith('video/') && !mediaArr[0].asFile) messageType = 'video';
            else messageType = 'document';
        }

        const { data: insertedMsg, error } = await supabase.from('messages').insert({
            chat_id: state.activeChatId, sender_id: state.currentUser.id, content: text, media: mediaArr,
            message_type: messageType,
            parent_id: state.replyingTo ? state.replyingTo.id : null
        }).select('*, profiles:sender_id(*)').single();
        
        if (error) throw error;

        cancelReply();
        delete (window as any).pendingUploads[tempId];
        
        // Remove tempDiv, since we will render the new one
        const tempDivEl = document.getElementById(tempId);
        if (tempDivEl) tempDivEl.remove();

        // Local UI update immediately
        if (state.activeChatId) {
            import('./messages-core').then(m => m.loadMessages(state.activeChatId!));
            import('./chat').then(c => c.loadChats());
            // Broadcast to other users
            import('./supabase').then(s => s.broadcastUpdate(state.activeChatId!, 'message'));
        }

    } catch (err: any) {
        if (err.message === 'Upload cancelled' || err.name === 'AbortError' || String(err).toLowerCase().includes('abort')) {
            document.getElementById(tempId)?.remove();
            import('./utils').then(m => m.customToast('Отправка отменена'));
        } else {
            console.error('Error sending message:', err);
            document.getElementById(tempId)?.remove();
            customAlert('Ошибка при отправке сообщения');
        }
    }
    
    handleInput();
}
export function cancelSend(tempId: string) {
    if ((window as any).pendingUploads && (window as any).pendingUploads[tempId]) {
        (window as any).pendingUploads[tempId].abort();
        delete (window as any).pendingUploads[tempId];
        document.getElementById(tempId)?.remove();
    }
}
