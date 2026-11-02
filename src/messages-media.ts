import { supabase, state } from './supabase';
import { scrollToBottom, customAlert, customConfirm, customPrompt, closeModal, customToast, getOrFetchMediaObjectUrl } from './utils';
import { isSelectionMode, toggleSelectionMode, toggleMessageSelection, deleteSelectedMessages, forwardSelectedMessages, confirmForwardMultiple, selectedMessages } from './selection';
import { openLightbox, closeLightbox, lightboxNext, lightboxPrev } from './lightbox';
import { toggleReactionMenu, toggleReaction, toggleMessageMenu, toggleEmojiMenu, sendEmojiMessage, getNotoEmojiUrl, closeAllMessageMenus, adjustMenuPosition, generateReactionsHtml } from './reactions';

import { handleInput, broadcastTyping, sendMessage } from "./messages-core";
import { getSyncMediaObjectUrl, getMediaBlobFromCache } from "./cache";
import { fetchMediaBlobResilient } from "./network";
let mediaObserver: IntersectionObserver | null = null;
const mediaDurationCache = new Map<string, number>();
const pendingDurationProbes = new Map<string, Promise<number>>();
let sharedDecodeCtx: AudioContext | null = null;

function formatMediaTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const totalSecs = Math.floor(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getEffectiveMediaDuration(
    mediaEl: HTMLMediaElement | null | undefined,
    containerEl?: Element | null,
    url?: string
): number {
    if (mediaEl && Number.isFinite(mediaEl.duration) && mediaEl.duration > 0.2 && mediaEl.duration < 86400) {
        (mediaEl as any)._trueDuration = mediaEl.duration;
        if (url) mediaDurationCache.set(url, mediaEl.duration);
        return mediaEl.duration;
    }
    if (mediaEl && Number.isFinite((mediaEl as any)._trueDuration) && (mediaEl as any)._trueDuration > 0) {
        return (mediaEl as any)._trueDuration;
    }
    if (url && mediaDurationCache.has(url)) {
        return mediaDurationCache.get(url)!;
    }
    const attrStr =
        mediaEl?.getAttribute('data-duration') ||
        containerEl?.getAttribute('data-duration') ||
        containerEl?.closest('[data-duration]')?.getAttribute('data-duration') ||
        '0';
    const attrDur = parseFloat(attrStr);
    if (Number.isFinite(attrDur) && attrDur > 0) {
        return attrDur;
    }
    if (mediaEl && Number.isFinite((mediaEl as any)._fallbackDuration) && (mediaEl as any)._fallbackDuration > 0) {
        return (mediaEl as any)._fallbackDuration;
    }
    return 0;
}

async function resolveTrueMediaDuration(
    url: string,
    mediaEl?: HTMLMediaElement | null,
    containerEl?: Element | null,
    onResolved?: (dur: number) => void
): Promise<number> {
    if (!url) return 0;
    if (mediaDurationCache.has(url)) {
        const cachedDur = mediaDurationCache.get(url)!;
        if (mediaEl) (mediaEl as any)._trueDuration = cachedDur;
        if (onResolved) onResolved(cachedDur);
        return cachedDur;
    }
    if (pendingDurationProbes.has(url)) {
        const dur = await pendingDurationProbes.get(url)!;
        if (dur > 0) {
            if (mediaEl) (mediaEl as any)._trueDuration = dur;
            if (onResolved) onResolved(dur);
        }
        return dur;
    }

    const probePromise = (async () => {
        try {
            const blobObjUrl = await getOrFetchMediaObjectUrl(url);
            if (!blobObjUrl) return 0;
            const res = await fetch(blobObjUrl);
            const arrayBuf = await res.arrayBuffer();
            if (!arrayBuf || arrayBuf.byteLength === 0) return 0;

            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return 0;
            if (!sharedDecodeCtx) {
                sharedDecodeCtx = new AudioContextClass();
            }
            const audioBuf = await sharedDecodeCtx.decodeAudioData(arrayBuf.slice(0));
            if (audioBuf && Number.isFinite(audioBuf.duration) && audioBuf.duration > 0.1) {
                const exactDur = audioBuf.duration;
                mediaDurationCache.set(url, exactDur);
                if (mediaEl) (mediaEl as any)._trueDuration = exactDur;
                if (containerEl) containerEl.setAttribute('data-duration', String(Math.round(exactDur)));
                if (onResolved) onResolved(exactDur);
                return exactDur;
            }
        } catch {
            // Ignore decode errors for silent videos or unsupported containers
        }
        return 0;
    })().finally(() => {
        pendingDurationProbes.delete(url);
    });

    pendingDurationProbes.set(url, probePromise);
    return probePromise;
}

function upgradeVideoToLocalBlob(video: HTMLVideoElement, rawUrl: string) {
    if (!video || !rawUrl || video.src.startsWith('blob:') || (video as any)._upgradingBlob) return;
    (video as any)._upgradingBlob = true;
    getOrFetchMediaObjectUrl(rawUrl)
        .then((blobObjUrl) => {
            if (!blobObjUrl || !video.isConnected || video.src.startsWith('blob:')) return;
            // Only hot-swap immediately if paused or muted-looping, or if user tried to seek while remote stream wasn't seekable
            const swapNow = video.paused || video.muted || (video as any)._pendingSeekPercent !== undefined;
            const performSwap = () => {
                if (!video.isConnected || video.src.startsWith('blob:')) return;
                const wasPlaying = !video.paused;
                const savedMuted = video.muted;
                const savedTime = video.currentTime || 0;
                const pendingPercent = (video as any)._pendingSeekPercent;
                delete (video as any)._pendingSeekPercent;

                video.src = blobObjUrl;
                video.muted = savedMuted;
                video.load();
                video.addEventListener(
                    'loadedmetadata',
                    () => {
                        const dur = getEffectiveMediaDuration(video, video.parentElement, rawUrl);
                        if (pendingPercent !== undefined && dur > 0) {
                            try {
                                video.currentTime = pendingPercent * dur;
                            } catch {}
                        } else if (savedTime > 0) {
                            try {
                                video.currentTime = savedTime;
                            } catch {}
                        }
                        if (wasPlaying) {
                            video.play().catch(() => {});
                        }
                    },
                    { once: true }
                );
            };

            if (swapNow) {
                performSwap();
            } else {
                video.addEventListener('ended', performSwap, { once: true });
                video.addEventListener('pause', performSwap, { once: true });
            }
        })
        .catch(() => {})
        .finally(() => {
            (video as any)._upgradingBlob = false;
        });
}

export function getMediaObserver() {
    if (!mediaObserver) {
        mediaObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                const target = entry.target as HTMLElement;
                if (entry.isIntersecting) {
                    if (target.hasAttribute('data-src')) {
                        const rawUrl = target.getAttribute('data-src')!;
                        target.setAttribute('data-url', rawUrl);
                        target.removeAttribute('data-src');
                        const syncBlobUrl = getSyncMediaObjectUrl(rawUrl);
                        if (syncBlobUrl) {
                            (target as HTMLImageElement | HTMLVideoElement).src = syncBlobUrl;
                        } else {
                            (target as HTMLImageElement | HTMLVideoElement).src = rawUrl;
                            getMediaBlobFromCache(rawUrl).then((cached) => {
                                if (cached && target.isConnected) {
                                    const mediaEl = target as HTMLImageElement | HTMLVideoElement;
                                    if (!mediaEl.src.startsWith('blob:')) {
                                        const wasPlaying = target.tagName === 'VIDEO' && !(mediaEl as HTMLVideoElement).paused;
                                        const curTime = target.tagName === 'VIDEO' ? (mediaEl as HTMLVideoElement).currentTime : 0;
                                        mediaEl.src = cached.objectUrl;
                                        if (target.tagName === 'VIDEO') {
                                            const vid = mediaEl as HTMLVideoElement;
                                            if (curTime > 0) {
                                                vid.addEventListener('loadedmetadata', () => {
                                                    try { vid.currentTime = curTime; } catch {}
                                                }, { once: true });
                                            }
                                            if (wasPlaying || vid.hasAttribute('data-autoplay')) {
                                                vid.play().catch(() => {});
                                            }
                                        }
                                    }
                                } else if (target.tagName === 'VIDEO' && target.isConnected) {
                                    upgradeVideoToLocalBlob(target as HTMLVideoElement, rawUrl);
                                }
                            }).catch(() => {});
                        }
                    } else if (target.tagName === 'VIDEO') {
                        const rawUrl = target.getAttribute('data-url') || (target as HTMLVideoElement).src;
                        if (rawUrl && !rawUrl.startsWith('blob:')) {
                            upgradeVideoToLocalBlob(target as HTMLVideoElement, rawUrl);
                        }
                    }

                    if (target.tagName !== 'VIDEO') {
                        observer.unobserve(target);
                    }
                    if (target.tagName === 'VIDEO' && target.hasAttribute('data-autoplay') && !target.hasAttribute('data-src')) {
                        const vid = target as HTMLVideoElement;
                        const circleContainer = vid.closest('.video-circle-container');
                        // Telegram behavior: all visible uninteracted circular videos play silently in the background!
                        if (circleContainer && circleContainer.classList.contains('uninteracted')) {
                            vid.muted = true;
                            vid.loop = true;
                            circleContainer.classList.remove('paused');
                            vid.play().catch(() => {});
                        } else if (!vid.muted) {
                            vid.play().catch(() => {});
                        }
                    }
                } else {
                    if (target.tagName === 'VIDEO') {
                        const vid = target as HTMLVideoElement;
                        vid.pause();
                        
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
                        if (circleContainer && !circleContainer.classList.contains('uninteracted')) {
                            circleContainer.classList.add('paused');
                            const playIcon = circleContainer.querySelector('.play-icon');
                            const pauseIcon = circleContainer.querySelector('.pause-icon');
                            if (playIcon) playIcon.classList.remove('hidden');
                            if (pauseIcon) pauseIcon.classList.add('hidden');
                        }
                    }
                }
            });
        }, { threshold: 0.15, rootMargin: '200px' });
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
        customToast('Загрузка файла...');
        const blob = await fetchMediaBlobResilient(url, undefined, false);
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        customToast('Файл скачан');
    } catch (e) {
        console.error('Download failed', e);
        customToast('Ошибка при скачивании файла');
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
            previewContent = `<img src="${url}" onload="URL.revokeObjectURL(this.src)" class="w-24 h-24 object-cover rounded-xl border border-gray-200 dark:border-gray-700">`;
        } else if (file.type.startsWith('video/')) {
            previewContent = `<video src="${url}" onloadeddata="URL.revokeObjectURL(this.src)" class="w-24 h-24 object-cover rounded-xl border border-gray-200 dark:border-gray-700"></video>`;
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

    // Videos (keep muted background-playing video circles running unless resetTime is true)
    document.querySelectorAll('video').forEach(v => {
        try {
            if (v !== exceptMediaElement) {
                const circleContainer = v.closest('.video-circle-container');
                const isMutedBackgroundCircle =
                    !resetTime &&
                    circleContainer &&
                    circleContainer.classList.contains('uninteracted') &&
                    v.muted;
                if (isMutedBackgroundCircle) return;

                if (!v.paused) v.pause();
                if (circleContainer && !circleContainer.classList.contains('uninteracted')) {
                    circleContainer.classList.add('paused');
                    const playIcon = circleContainer.querySelector('.play-icon');
                    const pauseIcon = circleContainer.querySelector('.pause-icon');
                    if (playIcon) playIcon.classList.remove('hidden');
                    if (pauseIcon) pauseIcon.classList.add('hidden');
                }
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
    const targetEl = event.target as HTMLElement | null;
    if (targetEl && targetEl.closest('.media-progress-container')) {
        return; // Handled by scrubber drag
    }

    const video = container.querySelector('video')!;
    if (!video) return;
    if (!video.src && video.hasAttribute('data-src')) {
        const raw = video.getAttribute('data-src')!;
        video.setAttribute('data-url', raw);
        video.src = getSyncMediaObjectUrl(raw) || raw;
        video.removeAttribute('data-src');
    }
    if (!video.src) return;

    const rawUrl = video.getAttribute('data-url') || video.src;
    if (rawUrl && !video.src.startsWith('blob:')) {
        upgradeVideoToLocalBlob(video, rawUrl);
    }
    if (rawUrl) {
        resolveTrueMediaDuration(rawUrl, video, container, () => updateVideoProgress(video));
    }

    // When another circle was previously unmuted, return it to muted background mode
    document.querySelectorAll('.video-circle-container:not(.uninteracted)').forEach((other) => {
        if (other !== container) {
            const otherVid = other.querySelector('video') as HTMLVideoElement | null;
            if (otherVid) {
                otherVid.muted = true;
                otherVid.loop = true;
                other.classList.add('uninteracted');
                other.classList.remove('paused', 'show-status');
                otherVid.play().catch(() => {});
            }
        }
    });

    if (container.classList.contains('uninteracted')) {
        container.classList.remove('uninteracted');
        video.muted = false;
        video.loop = false;
        try {
            video.currentTime = 0;
        } catch {}
        pauseAllMedia(video);
        video.play().catch(() => {});
        video.setAttribute('data-autoplay', 'true');

        // When unmuted circle finishes playing, return to silent looping background mode like Telegram
        video.onended = () => {
            video.muted = true;
            video.loop = true;
            container.classList.add('uninteracted');
            container.classList.remove('paused', 'show-status');
            const circle = container.querySelector('.video-progress-ring circle') as SVGCircleElement | null;
            if (circle) circle.style.strokeDashoffset = '301.6';
            video.play().catch(() => {});
        };

        const overlay = container.querySelector('.video-overlay-icon')!;
        const playIcon = overlay.querySelector('.play-icon')!;
        const pauseIcon = overlay.querySelector('.pause-icon')!;

        container.classList.remove('paused');
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');

        container.classList.add('show-status');
        if ((container as any).statusTimeout) clearTimeout((container as any).statusTimeout);
        (container as any).statusTimeout = setTimeout(() => container.classList.remove('show-status'), 900);
        updateVideoProgress(video);
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

    // Clicking on the outer 28% ring seeks to that angle on the circle
    if (distance > cx * 0.72) {
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += 2 * Math.PI;
        const progress = Math.max(0, Math.min(1, angle / (2 * Math.PI)));
        seekMedia(container, progress);

        container.classList.add('show-status');
        if ((container as any).statusTimeout) clearTimeout((container as any).statusTimeout);
        (container as any).statusTimeout = setTimeout(() => container.classList.remove('show-status'), 900);
        return;
    }

    const overlay = container.querySelector('.video-overlay-icon')!;
    const playIcon = overlay.querySelector('.play-icon')!;
    const pauseIcon = overlay.querySelector('.pause-icon')!;

    if (video.paused) {
        pauseAllMedia(video);
        video.play().catch(e => {
            if (e.name !== 'AbortError') {
                console.warn('Error playing video circle:', e);
                container.classList.add('paused');
                playIcon.classList.remove('hidden');
                pauseIcon.classList.add('hidden');
            }
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
    (container as any).statusTimeout = setTimeout(() => container.classList.remove('show-status'), 900);
}

export function updateVideoProgress(video: HTMLVideoElement) {
    const container = video.closest('.video-circle-container') as HTMLElement | null;
    if (!container) return;

    const rawUrl = video.getAttribute('data-url') || video.src;
    let effDuration = getEffectiveMediaDuration(video, container, rawUrl);
    const cur = video.currentTime || 0;

    if (effDuration <= 0 || cur > effDuration) {
        // Fallback if duration wasn't stored in DB and hasn't finished decoding yet
        effDuration = Math.max(effDuration, cur + 0.5, 5);
        (video as any)._fallbackDuration = effDuration;
        if (rawUrl && !mediaDurationCache.has(rawUrl)) {
            resolveTrueMediaDuration(rawUrl, video, container);
        }
    }

    const percent = Math.max(0, Math.min(1, cur / effDuration));

    // Update time badge inside circle
    const badgeText = container.querySelector('.circle-time-text') as HTMLElement | null;
    if (badgeText) {
        if (container.classList.contains('uninteracted')) {
            badgeText.textContent = formatMediaTime(effDuration);
        } else {
            badgeText.textContent = `${formatMediaTime(cur)} / ${formatMediaTime(effDuration)}`;
        }
    }

    const ring = container.querySelector('.video-progress-ring');
    if (isDraggingMedia && currentDragContainer === ring) {
        return;
    }

    const circle = container.querySelector('.video-progress-ring circle') as SVGCircleElement | null;
    if (circle) {
        const circumference = 301.6; // 2 * PI * 48
        const offset = circumference - (percent * circumference);
        if (Number.isFinite(offset)) {
            circle.style.strokeDashoffset = offset.toString();
        }
    }
}

export function toggleInlineVideo(video: HTMLVideoElement) {
    if (isSelectionMode) {
        return; // Handled by wrapper onclick
    }
    if (!video.src && video.hasAttribute('data-src')) {
        const raw = video.getAttribute('data-src')!;
        video.setAttribute('data-url', raw);
        video.src = getSyncMediaObjectUrl(raw) || raw;
        video.removeAttribute('data-src');
    }
    if (!video.src) return;
    const container = video.closest('.chat-media-item-container') as HTMLElement;
    if (!container) return;

    const rawUrl = video.getAttribute('data-url') || video.src;
    if (rawUrl && !video.src.startsWith('blob:')) {
        upgradeVideoToLocalBlob(video, rawUrl);
    }
    if (rawUrl) {
        resolveTrueMediaDuration(rawUrl, video, container);
    }

    const playIcon = container.querySelector('.play-icon');
    const pauseIcon = container.querySelector('.pause-icon');
    const overlay = container.querySelector('.video-overlay');

    // Setup timeupdate listener if not already done
    if (!video.hasAttribute('data-listener-attached')) {
        video.addEventListener('timeupdate', () => {
            if (isDraggingMedia && currentDragContainer === container.querySelector('.media-progress-container')) return;
            const progressBar = container.querySelector('.video-progress-bar') as HTMLElement;
            const timeDisplay = container.querySelector('.video-time') as HTMLElement;
            const cur = video.currentTime || 0;
            const dur = getEffectiveMediaDuration(video, container, rawUrl);
            if (progressBar && dur > 0) {
                const percent = Math.max(0, Math.min(100, (cur / dur) * 100));
                progressBar.style.width = `${percent}%`;
            }
            if (timeDisplay) {
                timeDisplay.textContent = dur > 0 ? `${formatMediaTime(cur)} / ${formatMediaTime(dur)}` : formatMediaTime(cur);
            }
        });
        video.addEventListener('ended', () => {
            if (video.currentTime > 0) {
                (video as any)._trueDuration = video.currentTime;
                if (rawUrl) mediaDurationCache.set(rawUrl, video.currentTime);
            }
            if (playIcon) playIcon.classList.remove('hidden');
            if (pauseIcon) pauseIcon.classList.add('hidden');
            if (overlay) overlay.classList.remove('opacity-0');
        });
        video.addEventListener('pause', () => {
            if (playIcon) playIcon.classList.remove('hidden');
            if (pauseIcon) pauseIcon.classList.add('hidden');
            if (overlay) overlay.classList.remove('opacity-0');
        });
        video.addEventListener('play', () => {
            if (playIcon) playIcon.classList.add('hidden');
            if (pauseIcon) pauseIcon.classList.remove('hidden');
            if (overlay) overlay.classList.add('opacity-0');
        });
        video.setAttribute('data-listener-attached', 'true');
    }

    if (video.paused) {
        pauseAllMedia(video);
        video.play().catch(e => {
            if (e.name !== 'AbortError') {
                console.warn('Error playing inline video:', e);
                customToast('Не удалось воспроизвести видео.');
                if (playIcon) playIcon.classList.remove('hidden');
                if (pauseIcon) pauseIcon.classList.add('hidden');
                if (overlay) overlay.classList.remove('opacity-0');
            }
        });
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
    const container = (btn.closest('.audio-player-container') || btn.closest('div')!) as HTMLElement;
    const progressBar = container.querySelector('.progress-bar') as HTMLElement;
    const timeDisplay = container.querySelector('.time-display') as HTMLElement;

    const attrDur = parseFloat(container.getAttribute('data-duration') || '0');
    if (attrDur > 0 && !mediaDurationCache.has(url)) {
        mediaDurationCache.set(url, attrDur);
    }

    if (!player) {
        const initialSrc = getSyncMediaObjectUrl(url) || url;
        player = new Audio(initialSrc);
        player.preload = 'auto';
        if (attrDur > 0) (player as any)._trueDuration = attrDur;
        state.audioPlayers.set(url, player);
        if (!initialSrc.startsWith('blob:')) {
            getOrFetchMediaObjectUrl(url)
                .then((blobObjUrl) => {
                    if (player && blobObjUrl && !player.src.startsWith('blob:') && player.paused) {
                        player.src = blobObjUrl;
                    }
                })
                .catch(() => {});
        }
    }

    // Probe exact decoded duration so WebM voice notes never jump back and forth
    resolveTrueMediaDuration(url, player, container, (exactDur) => {
        if (player && player.paused && timeDisplay && (player.currentTime || 0) === 0) {
            timeDisplay.textContent = formatMediaTime(exactDur);
        }
    });

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
        if (!(player as any)._retriedBlob) {
            (player as any)._retriedBlob = true;
            getOrFetchMediaObjectUrl(url)
                .then((blobObjUrl) => {
                    if (player && blobObjUrl) {
                        player.src = blobObjUrl;
                        player.play().catch(() => {});
                    }
                })
                .catch(() => {
                    customToast('Аудио повреждено или недоступно');
                    playIcon.classList.remove('hidden');
                    pauseIcon.classList.add('hidden');
                    if (timeDisplay) timeDisplay.textContent = 'Ошибка';
                });
            return;
        }
        customToast('Аудио повреждено или недоступно');
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        if (timeDisplay) timeDisplay.textContent = 'Ошибка';
    };
    player.ontimeupdate = () => {
        if (isDraggingMedia && currentDragContainer === progressBar?.closest('.media-progress-container')) return;
        const cur = player!.currentTime || 0;
        let effectiveDur = getEffectiveMediaDuration(player, container, url);
        if (effectiveDur <= 0 || cur > effectiveDur) {
            effectiveDur = Math.max(effectiveDur, cur + 0.5, 5);
            (player as any)._fallbackDuration = effectiveDur;
        }
        const percent = Math.max(0, Math.min(100, (cur / effectiveDur) * 100));
        if (progressBar && !isNaN(percent)) progressBar.style.width = `${percent}%`;

        if (timeDisplay) {
            timeDisplay.textContent = formatMediaTime(cur);
        }
    };
    player.onended = () => {
        const finalTime = player?.currentTime || 0;
        if (finalTime > 0.2) {
            (player as any)._trueDuration = finalTime;
            mediaDurationCache.set(url, finalTime);
        }
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        if (progressBar) progressBar.style.width = '0%';
        const finalDur = getEffectiveMediaDuration(player, container, url);
        if (timeDisplay) timeDisplay.textContent = finalDur > 0 ? formatMediaTime(finalDur) : '0:00';
    };

    if (player.paused) {
        pauseAllMedia(player);
        player.play().catch(e => {
            if (e.name !== 'AbortError') {
                if (!(player as any)._retriedBlob) {
                    (player as any)._retriedBlob = true;
                    getOrFetchMediaObjectUrl(url)
                        .then((blobObjUrl) => {
                            if (player && blobObjUrl) {
                                player.src = blobObjUrl;
                                player.play().catch(() => {});
                            }
                        })
                        .catch(() => {
                            customToast('Не удалось воспроизвести аудио.');
                        });
                } else {
                    console.warn('Error playing audio:', e);
                    customToast('Не удалось воспроизвести аудио.');
                }
            }
        });
    } else {
        player.pause();
    }
}

let isDraggingMedia = false;
let currentDragContainer: HTMLElement | null = null;
let mediaDragMoved = false;

document.addEventListener('mousedown', startMediaDrag, true);
document.addEventListener('touchstart', startMediaDrag, { passive: false, capture: true });
document.addEventListener('mousemove', handleMediaDrag, true);
document.addEventListener('touchmove', handleMediaDrag, { passive: false, capture: true });
document.addEventListener('mouseup', stopMediaDrag, true);
document.addEventListener('touchend', stopMediaDrag, true);
document.addEventListener('click', (e) => {
    if (mediaDragMoved) {
        e.stopPropagation();
        e.preventDefault();
        mediaDragMoved = false;
    }
}, true);

function startMediaDrag(e: MouseEvent | TouchEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const container =
        (target.closest('.media-progress-container') as HTMLElement) ||
        (target.closest('.video-progress-ring') as HTMLElement);
    if (container) {
        e.stopPropagation();
        isDraggingMedia = true;
        currentDragContainer = container;
        mediaDragMoved = false;
        handleMediaDrag(e);
    }
}

function handleMediaDrag(e: MouseEvent | TouchEvent) {
    if (!isDraggingMedia || !currentDragContainer) return;

    mediaDragMoved = true;
    e.stopPropagation();

    if (e.cancelable) {
        e.preventDefault();
    }

    const touchObj = 'touches' in e ? (e.touches[0] || e.changedTouches[0]) : (e as MouseEvent);
    if (!touchObj) return;
    const clientX = touchObj.clientX;
    const clientY = touchObj.clientY;

    let percent = 0;

    if (currentDragContainer.classList.contains('video-progress-ring')) {
        const rect = currentDragContainer.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let angle = Math.atan2(clientY - centerY, clientX - centerX);
        angle = angle + Math.PI / 2;
        if (angle < 0) angle += 2 * Math.PI;
        percent = Math.max(0, Math.min(1, angle / (2 * Math.PI)));

        const circle = currentDragContainer.querySelector('circle') as SVGCircleElement;
        if (circle) {
            circle.style.transition = 'none';
            const circumference = 301.6;
            circle.style.strokeDashoffset = (circumference - (percent * circumference)).toString();
        }
    } else {
        const rect = currentDragContainer.getBoundingClientRect();
        if (rect.width <= 0) return;
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
}

function seekMedia(container: HTMLElement, percent: number) {
    if (!Number.isFinite(percent)) return;
    const clampedPercent = Math.max(0, Math.min(1, percent));

    // 1. Voice / Audio message seeking
    const audioContainer = container.closest('.audio-player-container') as HTMLElement | null;
    if (audioContainer) {
        const btn = audioContainer.querySelector('button[onclick^="toggleAudio"]') as HTMLElement | null;
        const url =
            audioContainer.getAttribute('data-url') ||
            btn?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] ||
            '';
        if (url) {
            let player = state.audioPlayers.get(url);
            if (!player) {
                const initialSrc = getSyncMediaObjectUrl(url) || url;
                player = new Audio(initialSrc);
                player.preload = 'auto';
                state.audioPlayers.set(url, player);
                if (!initialSrc.startsWith('blob:')) {
                    getOrFetchMediaObjectUrl(url).catch(() => {});
                }
            }
            const dur = getEffectiveMediaDuration(player, audioContainer, url);
            const timeDisplay = audioContainer.querySelector('.time-display') as HTMLElement | null;
            if (dur > 0) {
                const targetTime = clampedPercent * dur;
                try {
                    player.currentTime = targetTime;
                } catch {}
                if (timeDisplay) {
                    timeDisplay.textContent = formatMediaTime(targetTime);
                }
            } else {
                resolveTrueMediaDuration(url, player, audioContainer, (resolvedDur) => {
                    if (player && resolvedDur > 0) {
                        try {
                            player.currentTime = clampedPercent * resolvedDur;
                        } catch {}
                    }
                });
            }
        }
        return;
    }

    // 2. Inline Video or Video Circle seeking
    const videoContainer = (container.closest('.chat-media-item-container') ||
        container.closest('.video-circle-container')) as HTMLElement | null;
    if (videoContainer) {
        const video = videoContainer.querySelector('video') as HTMLVideoElement | null;
        if (!video) return;

        if (!video.src && video.hasAttribute('data-src')) {
            const raw = video.getAttribute('data-src')!;
            video.setAttribute('data-url', raw);
            video.src = getSyncMediaObjectUrl(raw) || raw;
            video.removeAttribute('data-src');
            video.load();
        }

        const rawUrl = video.getAttribute('data-url') || video.src;
        const dur = getEffectiveMediaDuration(video, videoContainer, rawUrl);

        if (dur > 0) {
            const targetTime = clampedPercent * dur;
            try {
                video.currentTime = targetTime;
            } catch {}

            // Update visual displays immediately while dragging
            const timeDisplay = videoContainer.querySelector('.video-time') as HTMLElement | null;
            if (timeDisplay) {
                timeDisplay.textContent = `${formatMediaTime(targetTime)} / ${formatMediaTime(dur)}`;
            }
            const badgeText = videoContainer.querySelector('.circle-time-text') as HTMLElement | null;
            if (badgeText) {
                badgeText.textContent = `${formatMediaTime(targetTime)} / ${formatMediaTime(dur)}`;
            }
            const ringCircle = videoContainer.querySelector('.video-progress-ring circle') as SVGCircleElement | null;
            if (ringCircle) {
                const circumference = 301.6;
                ringCircle.style.strokeDashoffset = (circumference - clampedPercent * circumference).toString();
            }
        }

        // If the video isn't a local blob yet or metadata hasn't loaded, upgrade to local blob & apply pending seek
        if (rawUrl && (!video.src.startsWith('blob:') || video.readyState < 1 || dur <= 0)) {
            (video as any)._pendingSeekPercent = clampedPercent;
            upgradeVideoToLocalBlob(video, rawUrl);
            resolveTrueMediaDuration(rawUrl, video, videoContainer, (resolvedDur) => {
                if (video && resolvedDur > 0) {
                    try {
                        video.currentTime = clampedPercent * resolvedDur;
                    } catch {}
                }
            });
        }
    }
}

