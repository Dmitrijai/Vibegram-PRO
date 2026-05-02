import { supabase, state } from './supabase';
import { scrollToBottom, customAlert, customConfirm, customPrompt, closeModal, customToast } from './utils';
import { isSelectionMode, toggleSelectionMode, toggleMessageSelection, deleteSelectedMessages, forwardSelectedMessages, confirmForwardMultiple, selectedMessages } from './selection';
import { openLightbox, closeLightbox, lightboxNext, lightboxPrev } from './lightbox';
import { toggleReactionMenu, toggleReaction, toggleMessageMenu, toggleEmojiMenu, sendEmojiMessage, getNotoEmojiUrl, closeAllMessageMenus, adjustMenuPosition, generateReactionsHtml } from './reactions';

import { handleInput, broadcastTyping, sendMessage } from "./messages-core";
let mediaObserver: IntersectionObserver | null = null;

export function getMediaObserver() {
    if (!mediaObserver) {
        mediaObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                const target = entry.target as HTMLElement;
                if (entry.isIntersecting) {
                    if (target.hasAttribute('data-src')) {
                        (target as HTMLImageElement | HTMLVideoElement).src = target.getAttribute('data-src')!;
                        target.removeAttribute('data-src');
                    }
                    if (target.tagName !== 'VIDEO') {
                        observer.unobserve(target);
                    }
                    if (target.tagName === 'VIDEO' && target.hasAttribute('data-autoplay') && !target.hasAttribute('data-src')) {
                        (target as HTMLVideoElement).play().catch(() => {});
                    }
                } else {
                    if (target.tagName === 'VIDEO') {
                        (target as HTMLVideoElement).pause();
                        
                        // Update UI for inline videos
                        const container = target.closest('.chat-media-item-container');
                        if (container) {
                            const playIcon = container.querySelector('.play-icon');
                            const pauseIcon = container.querySelector('.pause-icon');
                            const overlay = container.querySelector('.video-overlay');
                            if (playIcon) playIcon.classList.remove('hidden');
                            if (pauseIcon) pauseIcon.classList.add('hidden');
                            if (overlay) overlay.classList.remove('opacity-0');
                        }
                        
                        // Update UI for video circles
                        const circleContainer = target.closest('.video-circle-container');
                        if (circleContainer) {
                            circleContainer.classList.add('paused');
                            const playIcon = circleContainer.querySelector('.play-icon');
                            const pauseIcon = circleContainer.querySelector('.pause-icon');
                            if (playIcon) playIcon.classList.remove('hidden');
                            if (pauseIcon) pauseIcon.classList.add('hidden');
                        }
                    }
                }
            });
        }, { threshold: 0.1, rootMargin: '300px' });
    }
    return mediaObserver;
}
export function toggleAttachMenu(event: Event) {
    event.stopPropagation();
    const menu = document.getElementById('attach-menu');
    if (menu) {
        menu.classList.toggle('hidden');
        
        const pollBtn = document.getElementById('attach-poll-btn');
        if (pollBtn) {
            if (state.activeChatIsGroup || state.activeChatType === 'channel') {
                pollBtn.classList.remove('hidden');
            } else {
                pollBtn.classList.add('hidden');
            }
        }
    }
}
export async function downloadMedia(url: string, filename: string) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
    } catch (e) {
        console.error('Download failed', e);
        customToast('Ошибка при скачивании. Открываем в новой вкладке...');
        window.open(url, '_blank');
    }
}
(window as any).downloadMedia = downloadMedia;
export function handleDownloadMessageMedia(encodedMedia: string) {
    if (isSelectionMode && selectedMessages.size > 0) {
        customToast('Скачивание нескольких сообщений пока не поддерживается');
        return;
    }
    try {
        const media = JSON.parse(decodeURIComponent(encodedMedia));
        if (!media || media.length === 0) return;
        
        if (media.length === 1) {
            downloadMedia(media[0].url, media[0].name || 'media');
            return;
        }
        
        // Multiple files - show selection modal
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fadeIn';
        
        let selectedIndices = new Set(media.map((_: any, i: number) => i)); // Select all by default
        
        const renderModal = () => {
            modal.innerHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                    <div class="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                        <h3 class="font-bold text-lg text-gray-800 dark:text-gray-100">Скачать файлы</h3>
                        <button class="close-btn text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div class="p-4 overflow-y-auto flex-1 flex flex-col gap-2">
                        ${media.map((m: any, i: number) => `
                            <div class="file-item flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl cursor-pointer transition-colors" data-index="${i}">
                                <div class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${selectedIndices.has(i) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'}">
                                    <svg class="w-3 h-3 text-white ${selectedIndices.has(i) ? 'opacity-100' : 'opacity-0'} transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                                </div>
                                <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center text-blue-500 shrink-0">
                                    ${m.type?.startsWith('image/') ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>' : 
                                      m.type?.startsWith('video/') ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>' :
                                      m.type?.startsWith('audio/') ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>' :
                                      '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>'}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">${m.name || 'Файл'}</div>
                                    <div class="text-xs text-gray-500 dark:text-gray-400">${m.size ? (m.size / 1024 / 1024).toFixed(2) + ' MB' : ''}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="p-4 border-t border-gray-100 dark:border-gray-700">
                        <button class="download-btn w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed" ${selectedIndices.size === 0 ? 'disabled' : ''}>
                            Скачать ${selectedIndices.size > 0 ? `(${selectedIndices.size})` : ''}
                        </button>
                    </div>
                </div>
            `;
            
            modal.querySelector('.close-btn')?.addEventListener('click', () => modal.remove());
            modal.querySelectorAll('.file-item').forEach(item => {
                item.addEventListener('click', () => {
                    const idx = parseInt((item as HTMLElement).dataset.index!);
                    if (selectedIndices.has(idx)) {
                        selectedIndices.delete(idx);
                    } else {
                        selectedIndices.add(idx);
                    }
                    renderModal();
                });
            });
            modal.querySelector('.download-btn')?.addEventListener('click', async () => {
                const indices = Array.from(selectedIndices) as number[];
                for (const index of indices) {
                    await downloadMedia(media[index].url, media[index].name || 'media');
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                modal.remove();
            });
        };
        
        renderModal();
        document.body.appendChild(modal);
        
    } catch (e) {
        console.error('Error parsing media for download:', e);
    }
}
(window as any).handleDownloadMessageMedia = handleDownloadMessageMedia;
(window as any).downloadMedia = downloadMedia;
export function handleMediaSelect(e: any) {
    let newFiles = Array.from(e.target.files) as File[];
    
    const isPremium = state.currentProfile?.is_premium && (!state.currentProfile.premium_until || new Date(state.currentProfile.premium_until) > new Date());
    const maxSizeMB = isPremium ? 800 : 300; 
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    const currentTotalSize = (state.selectedFiles || []).reduce((acc: number, f: File) => acc + f.size, 0);
    const newTotalSize = newFiles.reduce((acc: number, f: File) => acc + f.size, 0);
    
    if (currentTotalSize + newTotalSize > maxSizeBytes) {
        import('./utils').then(m => m.customToast(`Общий размер файлов превышает ${maxSizeMB}МБ.${!isPremium ? ' Приобретите Premium для увеличения лимита до 800МБ!' : ''}`));
        e.target.value = '';
        return;
    }
    
    if (newFiles.length > 0) {
        state.selectedFiles = [...state.selectedFiles, ...newFiles];
        // Mark these as media so they don't render as files
        state.selectedFiles.forEach((f: any) => f.asFile = false);
    }
    
    if (state.selectedFiles.length === 0) {
        e.target.value = '';
        return;
    }
    
    document.getElementById('attach-menu')?.classList.add('hidden');
    renderMediaModal();
}
export function removeSelectedMedia(index: number) {
    state.selectedFiles.splice(index, 1);
    if (state.selectedFiles.length === 0) {
        (window as any).closeModal();
        (document.getElementById('media-input') as HTMLInputElement).value = '';
    } else {
        renderMediaModal();
    }
}
(window as any).removeSelectedMedia = removeSelectedMedia;
export function renderMediaModal() {
    const modal = document.getElementById('modal-content')!;
    
    let mediaPreviewsHtml = '<div class="flex overflow-x-auto gap-3 pb-3 mb-4 snap-x">';
    state.selectedFiles.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        let previewContent = '';
        if (file.type.startsWith('image/')) {
            previewContent = `<img src="${url}" class="w-24 h-24 object-cover rounded-xl border border-gray-200 dark:border-gray-700">`;
        } else if (file.type.startsWith('video/')) {
            previewContent = `<video src="${url}" class="w-24 h-24 object-cover rounded-xl border border-gray-200 dark:border-gray-700"></video>`;
        }
        
        mediaPreviewsHtml += `
            <div class="relative shrink-0 snap-start">
                ${previewContent}
                <button onclick="removeSelectedMedia(${index})" class="absolute top-1 right-1 z-10 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `;
    });
    
    // Add button
    mediaPreviewsHtml += `
        <label class="shrink-0 w-24 h-24 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            <svg class="w-8 h-8 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            <span class="text-xs text-gray-500 font-medium">Добавить</span>
            <input type="file" class="hidden" multiple accept="image/*,video/*" onchange="handleMediaSelect(event)">
        </label>
    `;
    
    mediaPreviewsHtml += '</div>';
    
    // Preserve caption if it exists
    const existingCaption = (document.getElementById('media-caption-input') as HTMLInputElement)?.value || '';

    modal.innerHTML = `
        <div class="p-6">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">Отправить медиа (${state.selectedFiles.length})</h3>
                <button onclick="closeModal(); document.getElementById('media-input').value = ''; clearMediaSelection();" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors">✕</button>
            </div>
            ${mediaPreviewsHtml}
            <input type="text" id="media-caption-input" placeholder="Добавить подпись..." value="${existingCaption}" class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-blue-500 transition-colors text-gray-900 dark:text-gray-100 mb-4">
            <button id="send-media-btn" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-md">
                Отправить
            </button>
        </div>
    `;
    
    document.getElementById('modal-overlay')!.classList.remove('hidden');
    
    document.getElementById('send-media-btn')!.onclick = () => {
        const caption = (document.getElementById('media-caption-input') as HTMLInputElement).value.trim();
        const input = document.getElementById('message-input') as HTMLTextAreaElement;
        input.value = caption;
        (window as any).closeModal();
        sendMessage();
        (document.getElementById('media-input') as HTMLInputElement).value = '';
    };
}
export function clearMediaSelection() {
    state.selectedFiles = [];
}
export function handleFileSelect(e: any) {
    let newFiles = Array.from(e.target.files) as File[];
    
    const isPremium = state.currentProfile?.is_premium && (!state.currentProfile.premium_until || new Date(state.currentProfile.premium_until) > new Date());
    const maxSizeMB = isPremium ? 800 : 300; 
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    const newTotalSize = newFiles.reduce((acc: number, f: File) => acc + f.size, 0);
    
    if (newTotalSize > maxSizeBytes) {
        import('./utils').then(m => m.customToast(`Общий размер файлов превышает ${maxSizeMB}МБ.${!isPremium ? ' Приобретите Premium для увеличения лимита до 800МБ!' : ''}`));
        e.target.value = '';
        return;
    }
    
    state.selectedFiles = newFiles;
    state.selectedFiles.forEach((f: any) => f.asFile = true);
    
    if(state.selectedFiles.length === 0) {
        e.target.value = '';
        return;
    }
    document.getElementById('attach-menu')?.classList.add('hidden');
    document.getElementById('file-preview-area')!.classList.remove('hidden');
    if (state.selectedFiles.length === 1) {
        document.getElementById('file-preview-name')!.innerText = state.selectedFiles[0].name;
    } else {
        document.getElementById('file-preview-name')!.innerText = `Выбрано файлов: ${state.selectedFiles.length}`;
    }
    handleInput();
    broadcastTyping('uploading_file');
}
export function clearFile() {
    state.selectedFiles = [];
    (document.getElementById('file-input') as HTMLInputElement).value = '';
    document.getElementById('file-preview-area')!.classList.add('hidden');
    handleInput();
}
export function pauseAllMedia(exceptMediaElement?: HTMLAudioElement | HTMLVideoElement | string, resetTime = false) {
    // Audio
    state.audioPlayers.forEach((p, url) => {
        try {
            if (url !== exceptMediaElement && p !== exceptMediaElement) {
                if (!p.paused) p.pause();
                if (resetTime && !isNaN(p.duration) && p.currentTime > 0) {
                    p.currentTime = 0;
                }
            }
        } catch (e) { console.error('Error pausing audio', e); }
    });

    // Videos
    document.querySelectorAll('video').forEach(v => {
        try {
            if (v !== exceptMediaElement) {
                if (!v.paused) v.pause();
                if (resetTime && !isNaN(v.duration) && v.currentTime > 0) {
                    v.currentTime = 0;
                }
            }
        } catch (e) { console.error('Error pausing video', e); }
    });
}

export function handleVideoCircleClick(event: MouseEvent, container: HTMLElement) {
    if (isSelectionMode) {
        return; // Handled by wrapper onclick
    }
    const video = container.querySelector('video')!;
    if (!video || !video.src) return;
    
    if (container.classList.contains('uninteracted')) {
        container.classList.remove('uninteracted');
        video.muted = false;
        video.currentTime = 0;
        pauseAllMedia(video);
        video.play().catch(() => {});
        video.setAttribute('data-autoplay', 'true');
        
        const overlay = container.querySelector('.video-overlay-icon')!;
        const playIcon = overlay.querySelector('.play-icon')!;
        const pauseIcon = overlay.querySelector('.pause-icon')!;
        
        container.classList.remove('paused');
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
        
        container.classList.add('show-status');
        if ((container as any).statusTimeout) clearTimeout((container as any).statusTimeout);
        (container as any).statusTimeout = setTimeout(() => container.classList.remove('show-status'), 1000);
        return;
    }
    
    const rect = container.getBoundingClientRect();
    
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const dx = x - cx;
    const dy = y - cy;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Если клик ближе к краю (внешние 30% радиуса), перематываем
    if (distance > cx * 0.7) {
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += 2 * Math.PI;
        const progress = angle / (2 * Math.PI);
        video.currentTime = progress * video.duration;
        
        // Показываем статус при перемотке
        container.classList.add('show-status');
        if ((container as any).statusTimeout) clearTimeout((container as any).statusTimeout);
        (container as any).statusTimeout = setTimeout(() => container.classList.remove('show-status'), 1000);
        return;
    }
    
    const overlay = container.querySelector('.video-overlay-icon')!;
    const playIcon = overlay.querySelector('.play-icon')!;
    const pauseIcon = overlay.querySelector('.pause-icon')!;
    
    if (video.paused) {
        pauseAllMedia(video);
        video.play().catch(e => {
            console.warn('Error playing video circle:', e);
            customToast('Не удалось воспроизвести видео. Возможно, формат не поддерживается вашим браузером.');
            container.classList.add('paused');
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
        });
        container.classList.remove('paused');
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
        video.setAttribute('data-autoplay', 'true');
    } else {
        video.pause();
        container.classList.add('paused');
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        video.removeAttribute('data-autoplay');
    }
    
    container.classList.add('show-status');
    if ((container as any).statusTimeout) clearTimeout((container as any).statusTimeout);
    (container as any).statusTimeout = setTimeout(() => container.classList.remove('show-status'), 1000);
}
export function updateVideoProgress(video: HTMLVideoElement) {
    const container = video.closest('.video-circle-container')!;
    const ring = container.querySelector('.video-progress-ring');
    if (isDraggingMedia && currentDragContainer === ring) return;
    const circle = container.querySelector('.video-progress-ring circle') as SVGCircleElement;
    if (!circle) return;
    
    const percent = video.currentTime / video.duration;
    const circumference = 301.6; // 2 * PI * 48
    const offset = circumference - (percent * circumference);
    circle.style.strokeDashoffset = offset.toString();
}
export function toggleInlineVideo(video: HTMLVideoElement) {
    if (isSelectionMode) {
        return; // Handled by wrapper onclick
    }
    if (!video.src) return;
    const container = video.closest('.chat-media-item-container') as HTMLElement;
    if (!container) return;
    
    const playIcon = container.querySelector('.play-icon');
    const pauseIcon = container.querySelector('.pause-icon');
    const overlay = container.querySelector('.video-overlay');
    
    if (video.paused) {
        pauseAllMedia(video);
        
        video.play().catch(e => {
            console.warn('Error playing inline video:', e);
            customToast('Не удалось воспроизвести видео. Возможно, формат не поддерживается вашим браузером.');
            if (playIcon) playIcon.classList.remove('hidden');
            if (pauseIcon) pauseIcon.classList.add('hidden');
            if (overlay) overlay.classList.remove('opacity-0');
        });
        if (playIcon) playIcon.classList.add('hidden');
        if (pauseIcon) pauseIcon.classList.remove('hidden');
        if (overlay) overlay.classList.add('opacity-0');
        
        // Setup timeupdate listener if not already done
        if (!video.hasAttribute('data-listener-attached')) {
            video.addEventListener('timeupdate', () => {
                if (isDraggingMedia && currentDragContainer === container.querySelector('.media-progress-container')) return;
                const progressBar = container.querySelector('.video-progress-bar') as HTMLElement;
                const timeDisplay = container.querySelector('.video-time') as HTMLElement;
                if (progressBar && video.duration) {
                    const percent = (video.currentTime / video.duration) * 100;
                    progressBar.style.width = `${percent}%`;
                }
                if (timeDisplay) {
                    const mins = Math.floor(video.currentTime / 60);
                    const secs = Math.floor(video.currentTime % 60);
                    timeDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                }
            });
            video.addEventListener('ended', () => {
                if (playIcon) playIcon.classList.remove('hidden');
                if (pauseIcon) pauseIcon.classList.add('hidden');
                if (overlay) overlay.classList.remove('opacity-0');
            });
            video.addEventListener('pause', () => {
                if (playIcon) playIcon.classList.remove('hidden');
                if (pauseIcon) pauseIcon.classList.add('hidden');
                if (overlay) overlay.classList.remove('opacity-0');
            });
            video.setAttribute('data-listener-attached', 'true');
        }
    } else {
        video.pause();
    }
}
export function toggleAudio(btn: HTMLElement, url: string) {
    if (isSelectionMode) {
        return; // Handled by wrapper onclick
    }
    if (!url || url === 'undefined') return;
    let player = state.audioPlayers.get(url);
    const playIcon = btn.querySelector('.play-icon')!;
    const pauseIcon = btn.querySelector('.pause-icon')!;
    const container = btn.closest('.audio-player-container') || btn.closest('div')!;
    const progressBar = container.querySelector('.progress-bar') as HTMLElement;
    const timeDisplay = container.querySelector('.time-display') as HTMLElement;

    if (!player) {
        player = new Audio(url);
        state.audioPlayers.set(url, player);
    }
    
    // Always attach event handlers to the latest DOM elements
    player.onpause = () => {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
    };
    player.onplay = () => {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
    };
    player.onerror = () => {
        customToast('Аудио повреждено или недоступно');
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        if (timeDisplay) timeDisplay.textContent = 'Ошибка';
    };
    player.ontimeupdate = () => {
        if (isDraggingMedia && currentDragContainer === progressBar?.closest('.media-progress-container')) return;
        if (isNaN(player!.duration) || player!.duration === 0) return;
        const percent = (player!.currentTime / player!.duration) * 100;
        if (progressBar && !isNaN(percent)) progressBar.style.width = `${percent}%`;
        
        if (timeDisplay) {
            const mins = Math.floor(player!.currentTime / 60);
            const secs = Math.floor(player!.currentTime % 60);
            if (!isNaN(mins) && !isNaN(secs)) {
                timeDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
        }
    };
    player.onended = () => {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        if (progressBar) progressBar.style.width = '0%';
        if (timeDisplay) timeDisplay.textContent = '0:00';
    };

    if (player.paused) {
        pauseAllMedia(player);
        
        player.play().catch(e => {
            console.warn('Error playing audio:', e);
            customToast('Не удалось воспроизвести аудио. Возможно, формат не поддерживается вашим браузером.');
        });
    } else {
        player.pause();
    }
}
let isDraggingMedia = false;
let currentDragContainer: HTMLElement | null = null;
let mediaDragMoved = false;

document.addEventListener('mousedown', startMediaDrag);
document.addEventListener('touchstart', startMediaDrag, { passive: false });
document.addEventListener('mousemove', handleMediaDrag);
document.addEventListener('touchmove', handleMediaDrag, { passive: false });
document.addEventListener('mouseup', stopMediaDrag);
document.addEventListener('touchend', stopMediaDrag);
document.addEventListener('click', (e) => {
    if (mediaDragMoved) {
        e.stopPropagation();
        e.preventDefault();
        mediaDragMoved = false;
    }
}, true);

function startMediaDrag(e: MouseEvent | TouchEvent) {
    const target = e.target as HTMLElement;
    const container = target.closest('.media-progress-container') as HTMLElement || target.closest('.video-progress-ring') as HTMLElement;
    if (container) {
        isDraggingMedia = true;
        currentDragContainer = container;
        mediaDragMoved = false;
        handleMediaDrag(e);
    }
}

function handleMediaDrag(e: MouseEvent | TouchEvent) {
    if (!isDraggingMedia || !currentDragContainer) return;
    
    mediaDragMoved = true;
    
    // Only prevent default for touch events to allow normal mouse behavior elsewhere
    if ('touches' in e && e.cancelable) {
        e.preventDefault();
    }
    
    let percent = 0;
    
    if (currentDragContainer.classList.contains('video-progress-ring')) {
        const rect = currentDragContainer.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let angle = Math.atan2(clientY - centerY, clientX - centerX);
        angle = angle + Math.PI / 2;
        if (angle < 0) angle += 2 * Math.PI;
        percent = angle / (2 * Math.PI);
        
        const circle = currentDragContainer.querySelector('circle') as SVGCircleElement;
        if (circle) {
            circle.style.transition = 'none';
            const circumference = 301.6;
            circle.style.strokeDashoffset = (circumference - (percent * circumference)).toString();
        }
    } else {
        const rect = currentDragContainer.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        let x = clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        percent = x / rect.width;
        
        const progressBar = currentDragContainer.querySelector('.progress-bar') as HTMLElement;
        if (progressBar) {
            progressBar.style.transition = 'none';
            progressBar.style.width = `${percent * 100}%`;
        }
    }
    
    seekMedia(currentDragContainer, percent);
}

function stopMediaDrag() {
    if (currentDragContainer) {
        if (currentDragContainer.classList.contains('video-progress-ring')) {
            const circle = currentDragContainer.querySelector('circle') as SVGCircleElement;
            if (circle) circle.style.transition = '';
        } else {
            const progressBar = currentDragContainer.querySelector('.progress-bar') as HTMLElement;
            if (progressBar) progressBar.style.transition = '';
        }
    }
    isDraggingMedia = false;
    currentDragContainer = null;
    // mediaDragMoved is reset in the click capture handler
}

function seekMedia(container: HTMLElement, percent: number) {
    const audioContainer = container.closest('.audio-player-container');
    if (audioContainer) {
        const btn = audioContainer.querySelector('button[onclick^="toggleAudio"]') as HTMLElement;
        const url = btn?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
        if (url) {
            const player = state.audioPlayers.get(url);
            if (player && player.duration) player.currentTime = percent * player.duration;
        }
        return;
    }
    
    const videoContainer = container.closest('.chat-media-item-container') || container.closest('.video-circle-container');
    if (videoContainer) {
        const video = videoContainer.querySelector('video');
        if (video && video.duration) video.currentTime = percent * video.duration;
    }
}
