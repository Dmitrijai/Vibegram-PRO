import { state, supabase } from './supabase';

export function escapeHtml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe.toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

export function showLoadingModal(text: string = 'Загрузка...') {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal-content');
    if (!overlay || !modal) return;
    overlay.classList.remove('hidden');
    modal.innerHTML = `<div class="p-12 flex flex-col justify-center items-center"><div class="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div><div class="text-gray-500 font-medium">${text}</div></div>`;
}

export function hideLoadingModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
}

export const getFakeEmail = (nick: string) => `${nick.toLowerCase().trim().replace(/[^a-z0-9]/g, '')}@vibegram.local`;

export const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function showError(msg: string, isSuccess = false) {
    const err = document.getElementById('auth-error')!;
    err.innerText = msg;
    err.className = `mt-4 text-sm font-medium h-4 transition-all ${isSuccess ? 'text-green-500' : 'text-red-500'}`;
}

export function getStatusText(isOnline: boolean, lastSeenStr: string | null | undefined) {
    let actualOnline = isOnline;
    const now = new Date().getTime();
    if (actualOnline && lastSeenStr) {
        const lastSeenTime = new Date(lastSeenStr).getTime();
        // If last_seen is more than 3 minutes ago, consider offline
        if (now - lastSeenTime > 3 * 60 * 1000) {
            actualOnline = false;
        }
    }

    if (actualOnline) return 'в сети';
    if (!lastSeenStr) return 'был(а) недавно';
    const diffMinutes = Math.floor((now - new Date(lastSeenStr).getTime()) / 1000 / 60);
    if (diffMinutes < 1) return 'был(а) только что';
    if (diffMinutes < 60) return `был(а) ${diffMinutes} мин. назад`;
    if (diffMinutes < 1440) return `был(а) ${Math.floor(diffMinutes / 60)} ч. назад`;
    return `был(а) ${new Date(lastSeenStr).toLocaleDateString('ru-RU')}`;
}

export function confirmPaidMessageModal(price: number, nickname: string, onConfirm: () => void, onCancel?: () => void) {
    const overlay = document.getElementById('modal-overlay')!;
    const content = document.getElementById('modal-content')!;
    overlay.classList.remove('hidden');
    content.innerHTML = `
        <div class="p-6 flex flex-col items-center text-center">
            <div class="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mb-4 text-yellow-500 animate-pulse">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Платное сообщение</h3>
            <p id="paid-msg-desc" class="text-gray-500 dark:text-gray-400 mb-6">
                Пользователь <strong>${nickname}</strong> включил платные сообщения. <br>
                Стоимость отправки: <span class="font-bold text-yellow-500">${price} VIB</span>
            </p>
            
            <div class="w-full flex gap-3">
                <button id="cancel-paid-msg" class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Отмена</button>
                <button id="confirm-paid-msg" class="flex-1 px-4 py-3 bg-blue-500 text-white rounded-2xl font-bold hover:bg-blue-600 shadow-lg shadow-blue-500/30 transition-all active:scale-95" data-clicks="0">Оплатить</button>
            </div>
        </div>
    `;
    
    document.getElementById('cancel-paid-msg')!.onclick = () => {
        closeModal();
        if (onCancel) onCancel();
    };
    (window as any).__currentPaidModalCancel = onCancel;
    
    const btn = document.getElementById('confirm-paid-msg')!;
    let isConfirmed = false;
    btn.onclick = () => {
        if (isConfirmed) return;
        if (btn.getAttribute('data-clicks') === '0') {
            btn.setAttribute('data-clicks', '1');
            btn.textContent = 'Точно оплатить?';
            btn.className = 'flex-1 px-4 py-3 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 shadow-lg shadow-red-500/30 transition-all active:scale-95';
            document.getElementById('paid-msg-desc')!.innerHTML = `Списание <span class="font-bold text-red-500">${price} VIB</span> не подлежит возврату.`;
        } else {
            isConfirmed = true;
            btn.textContent = '...';
            (btn as HTMLButtonElement).disabled = true;
            closeModal();
            onConfirm();
        }
    };
}

export function closeModal(e?: any, skipHistoryBack = false) { 
    if ((window as any).__currentPaidModalCancel) {
        (window as any).__currentPaidModalCancel();
        (window as any).__currentPaidModalCancel = null;
    }

    if(e && e.target && e.target.id === 'modal-overlay') {
        const content = document.getElementById('modal-content');
        if (content && content.hasAttribute('data-prevent-bg-close')) {
            return;
        }
    } else if(e && e.target && e.target.id !== 'modal-overlay' && e.type !== 'click') {
        return;
    }
    
    const h = window.location.hash;
    if (!skipHistoryBack && (h === '#settings' || h === '#info' || h.startsWith('#create') || h === '#shorts-search' || h === '#miniapps')) {
        window.history.back();
        return;
    }

    document.getElementById('modal-overlay')!.classList.add('hidden'); 
    
    // Reset modal classes
    const modal = document.getElementById('modal-content');
    if (modal) {
        modal.classList.remove('max-w-full', 'w-[98vw]', 'h-[98vh]', 'max-h-[98dvh]', 'rounded-[20px]', 'max-w-[400px]');
        modal.classList.add('max-w-md', 'max-h-[90dvh]', 'rounded-3xl');
        modal.removeAttribute('data-prevent-bg-close');
    }

    state.groupCreationSelectedUsers = [];
    if ((window as any).toggleMediaSelectionMode) {
        (window as any).toggleMediaSelectionMode(false);
    }
}

export function scrollToBottom(smooth = true) { 
    setTimeout(() => {
        const list = document.getElementById('messages-list')!; 
        if (list) {
            list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'instant' }); 
        }
    }, 50);
}

let audioCtx: AudioContext | null = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Resume context on any click to bypass autoplay
function unlockAudioContext() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            // Just slightly above zero to trick iOS
            gain.gain.value = 0.001;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(0);
            osc.stop(0.05);
            ctx.resume();
        } catch(e) {}
    }
}
document.addEventListener('click', unlockAudioContext, { capture: true });
document.addEventListener('touchstart', unlockAudioContext, { capture: true });

let lastSoundPlayedAt = 0;
export function playNotificationSound() {
    try {
        const now = Date.now();
        if (now - lastSoundPlayedAt < 500) return; // debounce 500ms
        lastSoundPlayedAt = now;

        if (navigator.vibrate) {
            try { navigator.vibrate([100, 50, 100]); } catch (e) {}
        }
        const ctx = getAudioContext();
        if (!ctx) return;
        
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        
        // Soft single "pop" ping
        osc.frequency.setValueAtTime(900, ctx.currentTime);
        
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(1.2, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
        console.warn('Audio play blocked or not supported', e);
    }
}

export function closeChatMobile(skipHistoryBack = false) {
    import('./messages-recording').then(m => m.cancelRecording());
    if (state.activeChatParentInfo && Object.keys(state.activeChatParentInfo).length > 0) {
        const parentId = state.activeChatParentInfo.parentId;
        const targetMsgId = state.activeChatParentInfo.messageId;
        state.activeChatParentInfo = null; // clear it
        const chatEl = document.querySelector(`#chats-list > div[data-chat-id="${parentId}"]`) as HTMLElement;
        if (chatEl) {
            chatEl.click();
            if (targetMsgId) {
                // Try to scroll to it after opening
                setTimeout(() => {
                    import('./messages').then(m => m.loadMessagesUntil(parentId, targetMsgId));
                }, 100);
            }
            return;
        }
    }

    if (!skipHistoryBack && window.location.hash === '#chat') {
        if (window.innerWidth < 768) {
            window.history.back();
            return;
        } else {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }

    if ((window as any).logic?.pauseAllMedia) {
        (window as any).logic.pauseAllMedia(undefined, true);
    }
    if (state.activeChatId) {
        const list = document.getElementById('messages-list');
        if (list) {
            const isAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 50;
            if (isAtBottom) {
                state.chatScrollPositions.set(state.activeChatId, { type: 'bottom' });
            } else {
                let anchorId = null;
                let anchorOffset = 0;
                const children = Array.from(list.children) as HTMLElement[];
                for (let child of children) {
                    if (child.id && child.id.startsWith('msg-wrapper-')) {
                        const offset = child.offsetTop - list.scrollTop;
                        if (offset >= -50) {
                            anchorId = child.id;
                            anchorOffset = offset;
                            break;
                        }
                    }
                }
                if (anchorId) {
                    state.chatScrollPositions.set(state.activeChatId, { type: 'anchor', id: anchorId, offset: anchorOffset });
                } else {
                    state.chatScrollPositions.set(state.activeChatId, { type: 'bottom' });
                }
            }
        }
    }
    state.activeChatId = null; 
    import('./cache').then(c => c.clearActiveChatMeta()).catch(() => {});
    document.getElementById('current-chat-name')!.innerHTML = 'Выберите чат';
    document.getElementById('current-chat-status')!.innerText = '';
    document.getElementById('chat-header-avatar')!.classList.add('hidden');
    document.getElementById('messages-list')!.innerHTML = `
        <div class="flex h-full items-center justify-center">
            <div class="bg-black/40 dark:bg-black/60 text-white px-5 py-2 rounded-full text-sm backdrop-blur-md shadow-lg">Выберите чат для начала общения</div>
        </div>
    `;
    const inputArea = document.getElementById('input-area');
    if (inputArea) inputArea.style.display = 'none';
    const backBtn = document.querySelector('#chat-header-container button');
    if (backBtn) backBtn.className = 'hidden';
    
    document.getElementById('sidebar')!.classList.remove('hidden'); 
    
    // Only hide chat-area if we are on mobile. On desktop it should stay visible but empty.
    if (window.innerWidth < 768) {
        document.getElementById('chat-area')!.classList.add('hidden');
    }
    
    document.querySelectorAll('#chats-list > div').forEach(el => {
        el.classList.remove('bg-blue-50', 'dark:bg-blue-900/40', 'bg-blue-50/60', 'dark:bg-blue-900/30');
    });
    const headerContainer = document.getElementById('chat-header-container');
    if (headerContainer) {
        headerContainer.classList.remove('cursor-pointer', 'hover:bg-gray-50', 'dark:hover:bg-gray-800');
    }
}

export function showInAppNotification(chatId: string, title: string, text: string, avatarUrl: string | null) {
    const container = document.getElementById('in-app-notifications');
    if (!container) return;

    // Clear previous notifications
    container.innerHTML = '';

    const notif = document.createElement('div');
    notif.className = 'w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-3 flex items-center gap-3 transform -translate-y-4 opacity-0 transition-all duration-300 pointer-events-auto cursor-pointer flex-shrink-0';
    notif.style.backdropFilter = 'blur(10px)';
    
    // Add swipe to dismiss or close button wrapper
    const firstLetter = (title || 'U')[0].toUpperCase();
    const avatarHtml = avatarUrl 
        ? `<img src="${avatarUrl}" class="w-10 h-10 object-cover rounded-full shrink-0">` 
        : `<div class="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">${firstLetter}</div>`;

    notif.innerHTML = `
        ${avatarHtml}
        <div class="flex-1 min-w-0 pointer-events-none">
            <div class="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">${title}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 truncate">${text}</div>
        </div>
        <button class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0" onclick="event.stopPropagation(); this.closest('div.pointer-events-auto').remove()">
            <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;

    let clickCount = 0;
    let clickTimer: any;
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;

    notif.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isSwiping = true;
        notif.style.transition = 'none';
        clearTimeout(clickTimer);
    }, {passive: true});

    notif.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        currentX = e.touches[0].clientX - startX;
        notif.style.transform = `translate3d(${currentX}px, 0, 0)`;
        notif.style.opacity = `${Math.max(0, 1 - Math.abs(currentX) / (window.innerWidth * 0.8))}`;
    }, {passive: true});

    notif.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;
        notif.style.transition = 'all 0.3s ease';
        
        if (Math.abs(currentX) > 60) {
            // Dismiss
            const screenW = window.innerWidth;
            notif.style.transform = `translate3d(${currentX > 0 ? screenW : -screenW}px, 0, 0)`;
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
            return;
        } else {
            // Snap back
            notif.style.transform = '';
            notif.style.opacity = '1';
        }
        
        if (Math.abs(currentX) < 10) {
            // Treat as click if it was just a tap without movement
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                clickCount++;
                if (clickCount === 1) {
                    clickTimer = setTimeout(() => {
                        clickCount = 0;
                    }, 400); // Wait 400ms for a second tap
                    return;
                } else {
                    clickCount = 0;
                }
            }
            
            const chatElement = document.querySelector(`div[data-chat-id="${chatId}"]`) as HTMLElement;
            if (chatElement) {
                chatElement.click();
            } else {
                if ((window as any).logic?.loadChats) {
                    (window as any).logic.loadChats().then(() => {
                        const el = document.querySelector(`div[data-chat-id="${chatId}"]`) as HTMLElement;
                        if (el) el.click();
                    });
                }
            }
            notif.remove();
        }
        currentX = 0;
    });

    notif.onclick = (e) => {
        // Desktop click fallback
        if (window.innerWidth > 768) {
            const chatElement = document.querySelector(`div[data-chat-id="${chatId}"]`) as HTMLElement;
            if (chatElement) {
                chatElement.click();
            } else {
                if ((window as any).logic?.loadChats) {
                    (window as any).logic.loadChats().then(() => {
                        const el = document.querySelector(`div[data-chat-id="${chatId}"]`) as HTMLElement;
                        if (el) el.click();
                    });
                }
            }
            notif.remove();
        }
    };

    container.appendChild(notif);

    // Animate in
    setTimeout(() => {
        notif.classList.remove('-translate-y-4', 'opacity-0');
        notif.classList.add('translate-y-0', 'opacity-100');
    }, 10);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (document.body.contains(notif)) {
            notif.classList.remove('translate-y-0', 'opacity-100');
            notif.classList.add('-translate-y-4', 'opacity-0');
            setTimeout(() => notif.remove(), 300);
        }
    }, 5000);
}

export function customToast(message: string) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-gray-800/90 backdrop-blur-sm text-white px-5 py-2.5 rounded-full shadow-lg z-[200] text-sm opacity-0 transition-opacity duration-300 pointer-events-none';
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    
    // Trigger reflow
    void alertDiv.offsetWidth;
    
    alertDiv.classList.remove('opacity-0');
    
    setTimeout(() => {
        alertDiv.classList.add('opacity-0');
        setTimeout(() => {
            alertDiv.remove();
        }, 300);
    }, 2000);
}

export function toggleFullscreenApp(enable: boolean) {
    if (enable) {
        localStorage.setItem('vibegram_fullscreen', 'true');
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        }
    } else {
        localStorage.removeItem('vibegram_fullscreen');
        if (document.exitFullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(err => {
                console.warn(`Error attempting to exit full-screen mode: ${err.message} (${err.name})`);
            });
        }
    }
}

export function customAlert(msg: string) {
    const modal = document.getElementById('modal-content')!;
    modal.innerHTML = `
        <div class="p-6">
            <div class="mb-6">
                <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Внимание</h3>
                <p class="text-gray-600 dark:text-gray-300">${msg}</p>
            </div>
            <div class="flex justify-end">
                <button onclick="closeModal()" class="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors">ОК</button>
            </div>
        </div>
    `;
    document.getElementById('modal-overlay')!.classList.remove('hidden');
}

export function customConfirm(msg: string): Promise<boolean> {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-content')!;
        modal.innerHTML = `
            <div class="p-6">
                <div class="mb-6">
                    <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Подтверждение</h3>
                    <p class="text-gray-600 dark:text-gray-300">${msg}</p>
                </div>
                <div class="flex justify-end gap-2">
                    <button id="confirm-cancel" class="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">Отмена</button>
                    <button id="confirm-ok" class="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors">Подтвердить</button>
                </div>
            </div>
        `;
        document.getElementById('modal-overlay')!.classList.remove('hidden');
        
        document.getElementById('confirm-cancel')!.onclick = () => {
            closeModal();
            resolve(false);
        };
        document.getElementById('confirm-ok')!.onclick = () => {
            closeModal();
            resolve(true);
        };
    });
}

export function customPrompt(title: string, defaultValue: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-content')!;
        modal.innerHTML = `
            <div class="p-6">
                <div class="mb-4">
                    <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">${title}</h3>
                    <textarea id="prompt-input" class="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-blue-500 text-gray-900 dark:text-gray-100 resize-none h-32">${defaultValue}</textarea>
                </div>
                <div class="flex justify-end gap-2">
                    <button id="prompt-cancel" class="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">Отмена</button>
                    <button id="prompt-ok" class="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors">Сохранить</button>
                </div>
            </div>
        `;
        document.getElementById('modal-overlay')!.classList.remove('hidden');
        
        const input = document.getElementById('prompt-input') as HTMLTextAreaElement;
        input.focus();
        
        document.getElementById('prompt-cancel')!.onclick = () => {
            closeModal();
            resolve(null);
        };
        document.getElementById('prompt-ok')!.onclick = () => {
            closeModal();
            resolve(input.value);
        };
    });
}

const getCloudinaryConfig = () => {
    // Only access import.meta.env inside the function, otherwise TypeScript might complain if it's evaluated at module scope 
    // depending on the Vite setup. We type cast to `any` to avoid TS errors.
    const metaEnv = (import.meta as any).env || {};
    return {
        cloudName: metaEnv.VITE_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: metaEnv.VITE_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY,
        apiSecret: metaEnv.VITE_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET
    };
};

async function generateCloudinarySignature(paramsToSign: Record<string, string>, apiSecret: string): Promise<string> {
    const keys = Object.keys(paramsToSign).sort();
    const stringToSign = keys.map(k => `${k}=${paramsToSign[k]}`).join('&') + apiSecret;
    const msgBuffer = new TextEncoder().encode(stringToSign);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function extractPublicId(fileUrl: string) {
  try {
    const urlParts = fileUrl.split('/');
    const uploadIndex = urlParts.indexOf('upload');
    if (uploadIndex === -1) return null;
    let publicIdPart = urlParts.slice(uploadIndex + 1).join('/');
    if (publicIdPart.match(/^v\d+\//)) publicIdPart = publicIdPart.replace(/^v\d+\//, '');
    if (!fileUrl.includes('/raw/')) {
        const lastDotIndex = publicIdPart.lastIndexOf('.');
        if (lastDotIndex !== -1) publicIdPart = publicIdPart.substring(0, lastDotIndex);
    }
    return publicIdPart;
  } catch (e) {
    return null;
  }
}

export async function softDeleteCloudinaryFile(fileUrl: string): Promise<boolean> {
    try {
        if (fileUrl.includes('res.cloudinary.com') || fileUrl.includes('/cloudinary/')) {
            const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
            const publicId = extractPublicId(fileUrl);
            
            if (!publicId || !cloudName || !apiKey || !apiSecret) {
                const res = await fetch('/api/cloudinary/soft-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileUrl })
                });
                const data = await res.json();
                return data.success === true;
            }

            const timestamp = Math.round((new Date()).getTime() / 1000).toString();
            let resourceType = 'image';
            if (fileUrl.includes('/video/')) resourceType = 'video';
            else if (fileUrl.includes('/raw/')) resourceType = 'raw';
            
            const paramsToSign = {
               invalidate: 'true',
               public_id: publicId,
               timestamp: timestamp
            };
            
            const signature = await generateCloudinarySignature(paramsToSign, apiSecret);
            
            const formData = new FormData();
            formData.append('public_id', publicId);
            formData.append('invalidate', 'true');
            formData.append('api_key', apiKey);
            formData.append('timestamp', timestamp);
            formData.append('signature', signature);
            
            const { getActiveMediaGatewayBaseUrl } = await import('./network');
            const res = await fetch(`${getActiveMediaGatewayBaseUrl()}/cloudinary-api/v1_1/${cloudName}/${resourceType}/destroy`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            return data.result === 'ok';
        }

        const urlObj = new URL(fileUrl);
        const parts = urlObj.pathname.split('/');
        const publicIndex = parts.indexOf('public');
        if (publicIndex !== -1 && publicIndex + 2 < parts.length) {
            const bucket = parts[publicIndex + 1];
            const filePathStart = publicIndex + 2;
            const filePath = parts.slice(filePathStart).map(decodeURIComponent).join('/');
            
            const { error } = await supabase.storage.from(bucket).remove([filePath]);
            if (error) {
                console.error("Failed to delete supabase file:", error);
                return false;
            }
            return true;
        }
        return false;
    } catch (e) {
        console.error("Failed to soft delete file:", e);
        return false;
    }
}

const localMediaBlobCache = new Map<string, Blob>();

function normalizeMediaCacheKey(url: string): string {
    if (!url) return '';
    return url
        .split('?')[0]
        .replace(/^https?:\/\/[^/]+/, '')
        .replace(/^\/cloudinary/, '')
        .replace(/\/upload\/(?:f_[^/]+|q_[^/]+|w_[^/]+|h_[^/]+|c_[^/]+|g_[^/]+|br_[^/]+|ac_[^/]+|ar_[^/]+|vc_[^/]+|so_[^/]+)+\//, '/upload/');
}

export function cacheLocalMediaBlob(url: string, blob: Blob) {
    if (!url || !blob) return;
    localMediaBlobCache.set(url, blob);
    const norm = normalizeMediaCacheKey(url);
    if (norm) localMediaBlobCache.set(norm, blob);
    import('./cache').then((c) => c.saveMediaBlobToCache(url, blob)).catch(() => {});
}

export function getLocalMediaBlob(url: string): Blob | undefined {
    if (!url) return undefined;
    if (localMediaBlobCache.has(url)) return localMediaBlobCache.get(url);
    const norm = normalizeMediaCacheKey(url);
    return norm ? localMediaBlobCache.get(norm) : undefined;
}

export async function getOrFetchMediaObjectUrl(url: string, signal?: AbortSignal): Promise<string> {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;

    const memBlob = getLocalMediaBlob(url);
    if (memBlob) {
        const { saveMediaBlobToCache } = await import('./cache');
        return await saveMediaBlobToCache(url, memBlob);
    }

    const { getSyncMediaObjectUrl, getMediaBlobFromCache, saveMediaBlobToCache } = await import('./cache');
    const syncObj = getSyncMediaObjectUrl(url);
    if (syncObj) return syncObj;

    const cached = await getMediaBlobFromCache(url);
    if (cached) {
        localMediaBlobCache.set(url, cached.blob);
        const norm = normalizeMediaCacheKey(url);
        if (norm) localMediaBlobCache.set(norm, cached.blob);
        return cached.objectUrl;
    }

    const { fetchMediaBlobResilient } = await import('./network');
    const fetchedBlob = await fetchMediaBlobResilient(url, signal, true);
    localMediaBlobCache.set(url, fetchedBlob);
    const norm = normalizeMediaCacheKey(url);
    if (norm) localMediaBlobCache.set(norm, fetchedBlob);
    return await saveMediaBlobToCache(url, fetchedBlob);
}

export async function compressImageFile(file: File | Blob, isAvatar = false): Promise<File | Blob> {
    if (!file || !file.type || !file.type.startsWith('image/')) return file;
    if ((file as any).asFile) return file;
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
    if (!isAvatar && file.size < 80 * 1024) return file;

    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        const cleanup = () => URL.revokeObjectURL(objectUrl);

        img.onload = () => {
            try {
                const srcW = img.naturalWidth || img.width;
                const srcH = img.naturalHeight || img.height;
                if (!srcW || !srcH) {
                    cleanup();
                    resolve(file);
                    return;
                }

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    cleanup();
                    resolve(file);
                    return;
                }

                if (isAvatar) {
                    const targetSize = Math.min(256, Math.min(srcW, srcH));
                    canvas.width = targetSize;
                    canvas.height = targetSize;
                    const minSide = Math.min(srcW, srcH);
                    const sx = Math.floor((srcW - minSide) / 2);
                    const sy = Math.floor((srcH - minSide) / 2);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
                } else {
                    const maxDim = 1600;
                    let targetW = srcW;
                    let targetH = img.naturalHeight || img.height;
                    if (srcW > maxDim || targetH > maxDim) {
                        if (srcW >= targetH) {
                            targetW = maxDim;
                            targetH = Math.round((srcH * maxDim) / srcW);
                        } else {
                            targetH = maxDim;
                            targetW = Math.round((srcW * maxDim) / srcH);
                        }
                    }
                    canvas.width = targetW;
                    canvas.height = targetH;
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, targetW, targetH);
                }

                cleanup();
                const outType = 'image/webp';
                const quality = isAvatar ? 0.86 : 0.82;

                canvas.toBlob(
                    (blob) => {
                        if (!blob || (!isAvatar && blob.size >= file.size)) {
                            resolve(file);
                            return;
                        }
                        const origName = (file as File).name || 'image.webp';
                        const baseName = origName.replace(/\.[^.]+$/, '');
                        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
                        const compressedFile = new File([blob], `${baseName}.${ext}`, {
                            type: blob.type || outType,
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    },
                    outType,
                    quality
                );
            } catch {
                cleanup();
                resolve(file);
            }
        };

        img.onerror = () => {
            cleanup();
            resolve(file);
        };

        img.src = objectUrl;
    });
}

export async function uploadToCloudinary(file: File | Blob, isAvatar = false, abortSignal?: AbortSignal, targetBucket?: string): Promise<string> {
    const optimizedFile = await compressImageFile(file, isAvatar);
    const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
    
    if (cloudName && apiKey && apiSecret) {
        try {
            const timestamp = Math.round((new Date()).getTime() / 1000).toString();
            const paramsToSign = { timestamp };
            const signature = await generateCloudinarySignature(paramsToSign, apiSecret);

            const buildFormData = () => {
                const fd = new FormData();
                fd.append('file', optimizedFile);
                fd.append('api_key', apiKey);
                fd.append('timestamp', timestamp);
                fd.append('signature', signature);
                return fd;
            };
            
            const { MEDIA_GATEWAY_URLS, networkState, rewriteMediaUrl } = await import('./network');
            const onlineGateways = MEDIA_GATEWAY_URLS.filter((gwUrl) => {
                const node = networkState.gateways.find((g) => g.url === gwUrl);
                return !node || node.status !== 'blocked';
            });

            const uploadEndpoints = [
                `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
                ...onlineGateways.map((gw) => `${gw.replace(/\/$/, '')}/cloudinary-api/v1_1/${cloudName}/auto/upload`)
            ];

            const uploadViaEndpoint = async (endpointUrl: string) => {
                const res = await fetch(endpointUrl, {
                    method: 'POST',
                    body: buildFormData(),
                    signal: abortSignal
                });
                if (!res.ok) throw new Error(`Cloudinary upload error (${res.status}): ${await res.text()}`);
                return await res.json();
            };

            let data: any = null;
            if (optimizedFile.size < 2.5 * 1024 * 1024 && uploadEndpoints.length >= 2) {
                try {
                    data = await Promise.any(uploadEndpoints.slice(0, 2).map((ep) => uploadViaEndpoint(ep)));
                } catch {
                    // Fallback to sequential loop below
                }
            }

            if (!data) {
                let lastGwErr: any = null;
                for (const ep of uploadEndpoints) {
                    try {
                        data = await uploadViaEndpoint(ep);
                        break;
                    } catch (e: any) {
                        if (e?.name === 'AbortError') throw e;
                        lastGwErr = e;
                    }
                }
                if (!data) throw lastGwErr || new Error('All Cloudinary upload endpoints failed');
            }

            let url = data.secure_url;
            if (data.resource_type === 'image' || data.resource_type === 'video') {
                 if (isAvatar && data.resource_type === 'image') {
                     url = url.replace('/upload/', `/upload/f_auto,q_auto,c_fill,g_face,w_256,h_256/`);
                 }
            }
            
            const rewritten = rewriteMediaUrl(url);
            cacheLocalMediaBlob(url, optimizedFile);
            cacheLocalMediaBlob(rewritten, optimizedFile);
            return rewritten;
        } catch (err: any) {
            if (err.name === 'AbortError') throw err;
            console.warn("Cloudinary upload warning, trying fallback storage:", err);
        }
    }
    
    // Fallback to Supabase Storage through active working gateway if Cloudinary is unavailable
    try {
        let bucket = 'vibegram_media';
        if (targetBucket) {
             bucket = targetBucket;
        } else if (isAvatar) {
             bucket = 'vibegram_avatars';
        } else if (optimizedFile.type.startsWith('video/') || optimizedFile.type.startsWith('audio/')) {
             bucket = 'vibegram_voice_video';
        }

        const ext = optimizedFile instanceof File ? (optimizedFile.name.split('.').pop() || '') : (optimizedFile.type.split('/')[1] || 'bin');
        const userId = state?.currentUser?.id || 'public';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${ext}`;
        const filePath = `${userId}/${fileName}`;

        const { error } = await supabase.storage.from(bucket).upload(filePath, optimizedFile, {
            upsert: false
        });

        if (error) {
            throw new Error(`Supabase upload error: ${error.message}`);
        }

        const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
        const { rewriteMediaUrl } = await import('./network');
        const rewritten = rewriteMediaUrl(publicUrlData.publicUrl);
        cacheLocalMediaBlob(publicUrlData.publicUrl, optimizedFile);
        cacheLocalMediaBlob(rewritten, optimizedFile);
        return rewritten;
    } catch (err: any) {
        if (err.name === 'AbortError') throw err;
        console.error("Upload failed:", err);
        throw err;
    }
}

(window as any).handleMediaError = function(el: HTMLElement, url: string) {
    if (!el || !url) return;
    let retries = parseInt(el.getAttribute('data-retries') || '0', 10);
    if (retries < 3) {
        el.setAttribute('data-retries', (retries + 1).toString());
        const isVideo = el.tagName === 'VIDEO' || url.includes('/video/upload/');

        let rawCloudinaryUrl = url;
        const cloudIdx = url.indexOf('/cloudinary/');
        if (cloudIdx !== -1) {
            rawCloudinaryUrl = 'https://res.cloudinary.com' + url.substring(cloudIdx + '/cloudinary'.length);
        }

        // Step 1 (retry 0): For images, immediately fail over to wsrv.nl global CDN; for videos, ensure direct res.cloudinary.com or blob
        if (retries === 0) {
            if (!isVideo && el.tagName === 'IMG' && rawCloudinaryUrl.includes('res.cloudinary.com/')) {
                el.setAttribute('data-direct-cdn', 'true');
                (el as HTMLImageElement).src = `https://wsrv.nl/?url=${encodeURIComponent(rawCloudinaryUrl)}&output=webp&q=80`;
                return;
            }
            if (el.tagName === 'VIDEO' && rawCloudinaryUrl.startsWith('https://res.cloudinary.com/') && (el as HTMLVideoElement).src !== rawCloudinaryUrl) {
                const vid = el as HTMLVideoElement;
                const savedTime = vid.currentTime || 0;
                const wasPlaying = !vid.paused;
                vid.setAttribute('data-direct-cdn', 'true');
                vid.src = rawCloudinaryUrl;
                vid.load();
                if (savedTime > 0) {
                    vid.addEventListener('loadedmetadata', () => {
                        try { vid.currentTime = savedTime; } catch {}
                    }, { once: true });
                }
                if (wasPlaying || vid.hasAttribute('data-autoplay')) {
                    vid.play().catch(() => {});
                }
                return;
            }
        }

        // Step 2 (retry 1): Try online Edge Gateway if available
        if (retries === 1) {
            import('./network').then(({ rewriteMediaUrl, networkState, MEDIA_GATEWAY_URLS }) => {
                const onlineGw = MEDIA_GATEWAY_URLS.find((gwUrl) => {
                    const node = networkState.gateways.find((g) => g.url === gwUrl);
                    return node && node.status === 'online';
                });
                if (!onlineGw) {
                    (window as any).handleMediaError(el, url);
                    return;
                }
                const fallbackUrl = rewriteMediaUrl(url, onlineGw, true);
                const bustUrl = fallbackUrl + (fallbackUrl.includes('?') ? '&' : '?') + 'retry=1';
                el.setAttribute('data-direct-cdn', 'true');
                if (el.tagName === 'IMG') {
                    (el as HTMLImageElement).src = bustUrl;
                } else if (el.tagName === 'VIDEO') {
                    const vid = el as HTMLVideoElement;
                    const savedTime = vid.currentTime || 0;
                    const wasPlaying = !vid.paused;
                    vid.src = bustUrl;
                    vid.load();
                    if (savedTime > 0) {
                        vid.addEventListener('loadedmetadata', () => {
                            try { vid.currentTime = savedTime; } catch {}
                        }, { once: true });
                    }
                    if (wasPlaying || vid.hasAttribute('data-autoplay')) {
                        vid.play().catch(() => {});
                    }
                }
            });
            return;
        }

        // Step 3 (retry 2): Resilient Chunked Range / Blob Fetch + IndexedDB Cache
        getOrFetchMediaObjectUrl(url)
            .then((blobObjUrl) => {
                if (!blobObjUrl) return;
                el.onerror = null;
                if (el.tagName === 'IMG') {
                    (el as HTMLImageElement).src = blobObjUrl;
                } else if (el.tagName === 'VIDEO') {
                    const vid = el as HTMLVideoElement;
                    const savedTime = vid.currentTime || 0;
                    const wasPlaying = !vid.paused;
                    vid.src = blobObjUrl;
                    vid.load();
                    if (savedTime > 0) {
                        vid.addEventListener('loadedmetadata', () => {
                            try { vid.currentTime = savedTime; } catch {}
                        }, { once: true });
                    }
                    if (wasPlaying || vid.hasAttribute('data-autoplay')) {
                        vid.play().catch(() => {});
                    }
                }
            })
            .catch(() => {
                el.setAttribute('data-retries', '3');
                (window as any).handleMediaError(el, url);
            });
    } else {
        // Check if this is an avatar image inside a small circular container
        if (el.tagName === 'IMG' && (el.classList.contains('rounded-full') || el.closest('#chats-list, #chat-header-avatar, #my-avatar'))) {
            el.style.display = 'none';
            return;
        }

        const isVideo = el.tagName === 'VIDEO';
        const errorText = isVideo ? 'Нажмите, чтобы загрузить видео' : 'Нажмите, чтобы загрузить медиа';
        const aspectClsMatcher = Array.from(el.classList).find(c => c.startsWith('aspect-'));
        let aspectCls = aspectClsMatcher || 'aspect-square max-w-[180px] sm:max-w-[220px]';
        
        let container = el.parentElement;
        if (isVideo && container && (container.classList.contains('chat-media-item-container') || container.classList.contains('video-circle-container'))) {
            el = container;
            if (container.classList.contains('video-circle-container')) {
                aspectCls = 'w-[200px] h-[200px] rounded-full';
            }
        }
        
        const safeUrl = escapeHtml(url);
        el.outerHTML = `<div class="${aspectCls} w-full bg-gray-100 dark:bg-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-500 dark:text-gray-300 text-xs p-4 text-center border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" onclick="event.stopPropagation(); window.downloadMedia('${safeUrl}', 'media_file')"><svg class="w-8 h-8 mb-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>${errorText}</div>`;
    }
};

/**
 * Interactive Telegram-style Avatar Cropper Modal:
 * Supports mouse drag, touch pan, pinch-to-zoom, mouse wheel zoom, zoom slider, and 90° rotation.
 * Outputs a crisp 512x512 square image File ready for upload.
 */
export function openAvatarCropperModal(file: File): Promise<File | null> {
    return new Promise((resolve) => {
        if (!file || !file.type.startsWith('image/')) {
            resolve(file);
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
                URL.revokeObjectURL(objectUrl);
                resolve(file);
                return;
            }

            const existing = document.getElementById('avatar-cropper-modal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'avatar-cropper-modal';
            modal.className =
                'fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in';

            modal.innerHTML = `
                <div class="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-[360px] overflow-hidden flex flex-col">
                    <div class="px-5 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
                        <h3 class="font-bold text-base text-gray-900 dark:text-white">Настройка аватара</h3>
                        <button type="button" id="avatar-crop-cancel-top" class="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="p-5 flex flex-col items-center">
                        <div id="avatar-crop-viewport" class="relative w-[270px] h-[270px] rounded-2xl overflow-hidden bg-gray-950 cursor-grab active:cursor-grabbing touch-none shadow-inner">
                            <canvas id="avatar-crop-canvas" width="540" height="540" class="w-full h-full block pointer-events-none"></canvas>
                        </div>
                        <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-2.5 text-center">Перемещайте фото и изменяйте масштаб</p>
                        <div class="w-full mt-3 flex items-center gap-2.5 px-1">
                            <button type="button" id="avatar-crop-zoom-out" class="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0" title="Уменьшить">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                            </button>
                            <input id="avatar-crop-slider" type="range" min="1" max="4" step="0.01" value="1" class="flex-1 accent-blue-500 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer">
                            <button type="button" id="avatar-crop-zoom-in" class="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0" title="Увеличить">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                            </button>
                            <button type="button" id="avatar-crop-rotate" class="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0 ml-0.5" title="Повернуть на 90°">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2.5">
                        <button type="button" id="avatar-crop-cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700/60 transition-colors">
                            Отмена
                        </button>
                        <button type="button" id="avatar-crop-save" class="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-600 active:scale-95 text-white shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                            Готово
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const viewport = modal.querySelector('#avatar-crop-viewport') as HTMLElement;
            const canvas = modal.querySelector('#avatar-crop-canvas') as HTMLCanvasElement;
            const ctx = canvas.getContext('2d')!;
            const slider = modal.querySelector('#avatar-crop-slider') as HTMLInputElement;

            const C = 540; // Internal canvas size
            const R = 224; // Circle radius (diameter 448 inside 540 canvas)
            const D = R * 2;

            let zoom = 1;
            let offsetX = 0;
            let offsetY = 0;
            let rotationQuarterTurns = 0; // 0, 1, 2, 3

            const getEffectiveDimensions = () => {
                const swapped = rotationQuarterTurns % 2 === 1;
                return {
                    w: swapped ? img.naturalHeight : img.naturalWidth,
                    h: swapped ? img.naturalWidth : img.naturalHeight
                };
            };

            const clampOffsets = () => {
                const { w, h } = getEffectiveDimensions();
                const minScale = Math.max(D / w, D / h);
                const scale = minScale * zoom;
                const drawW = w * scale;
                const drawH = h * scale;
                const maxOffX = Math.max(0, (drawW - D) / 2);
                const maxOffY = Math.max(0, (drawH - D) / 2);
                offsetX = Math.max(-maxOffX, Math.min(maxOffX, offsetX));
                offsetY = Math.max(-maxOffY, Math.min(maxOffY, offsetY));
            };

            const renderPreview = () => {
                clampOffsets();
                ctx.clearRect(0, 0, C, C);
                ctx.fillStyle = '#090d16';
                ctx.fillRect(0, 0, C, C);

                const { w, h } = getEffectiveDimensions();
                const minScale = Math.max(D / w, D / h);
                const scale = minScale * zoom;

                ctx.save();
                ctx.translate(C / 2 + offsetX, C / 2 + offsetY);
                ctx.rotate((rotationQuarterTurns * Math.PI) / 2);
                ctx.scale(scale, scale);
                ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
                ctx.restore();

                // Darkened overlay outside the circular cutout (even-odd fill rule)
                ctx.save();
                ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
                ctx.beginPath();
                ctx.rect(0, 0, C, C);
                ctx.arc(C / 2, C / 2, R, 0, Math.PI * 2, true);
                ctx.fill('evenodd');

                // Subtle 3x3 rule-of-thirds grid & crisp circular border
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(C / 2, C / 2, R, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            };

            const setZoom = (newZoom: number) => {
                const clamped = Math.max(1, Math.min(4, newZoom));
                const ratio = clamped / zoom;
                offsetX *= ratio;
                offsetY *= ratio;
                zoom = clamped;
                slider.value = String(zoom);
                renderPreview();
            };

            slider.addEventListener('input', () => {
                setZoom(parseFloat(slider.value) || 1);
            });

            modal.querySelector('#avatar-crop-zoom-in')?.addEventListener('click', () => {
                setZoom(zoom + 0.25);
            });
            modal.querySelector('#avatar-crop-zoom-out')?.addEventListener('click', () => {
                setZoom(zoom - 0.25);
            });
            modal.querySelector('#avatar-crop-rotate')?.addEventListener('click', () => {
                rotationQuarterTurns = (rotationQuarterTurns + 1) % 4;
                const prevX = offsetX;
                offsetX = -offsetY;
                offsetY = prevX;
                renderPreview();
            });

            // Mouse drag & wheel
            let isDragging = false;
            let lastX = 0;
            let lastY = 0;
            let pinchStartDist = 0;
            let pinchStartZoom = 1;

            const onMouseDown = (e: MouseEvent) => {
                isDragging = true;
                lastX = e.clientX;
                lastY = e.clientY;
            };
            const onMouseMove = (e: MouseEvent) => {
                if (!isDragging) return;
                const rect = viewport.getBoundingClientRect();
                const factor = rect.width > 0 ? C / rect.width : 2;
                offsetX += (e.clientX - lastX) * factor;
                offsetY += (e.clientY - lastY) * factor;
                lastX = e.clientX;
                lastY = e.clientY;
                renderPreview();
            };
            const onMouseUp = () => {
                isDragging = false;
            };

            viewport.addEventListener('mousedown', onMouseDown);
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);

            viewport.addEventListener(
                'wheel',
                (e: WheelEvent) => {
                    e.preventDefault();
                    const delta = e.deltaY < 0 ? 0.14 : -0.14;
                    setZoom(zoom + delta);
                },
                { passive: false }
            );

            // Touch pan & two-finger pinch zoom
            viewport.addEventListener(
                'touchstart',
                (e: TouchEvent) => {
                    if (e.touches.length === 1) {
                        isDragging = true;
                        lastX = e.touches[0].clientX;
                        lastY = e.touches[0].clientY;
                    } else if (e.touches.length === 2) {
                        isDragging = false;
                        const dx = e.touches[0].clientX - e.touches[1].clientX;
                        const dy = e.touches[0].clientY - e.touches[1].clientY;
                        pinchStartDist = Math.hypot(dx, dy);
                        pinchStartZoom = zoom;
                    }
                },
                { passive: true }
            );

            viewport.addEventListener(
                'touchmove',
                (e: TouchEvent) => {
                    if (e.cancelable) e.preventDefault();
                    if (e.touches.length === 1 && isDragging) {
                        const rect = viewport.getBoundingClientRect();
                        const factor = rect.width > 0 ? C / rect.width : 2;
                        offsetX += (e.touches[0].clientX - lastX) * factor;
                        offsetY += (e.touches[0].clientY - lastY) * factor;
                        lastX = e.touches[0].clientX;
                        lastY = e.touches[0].clientY;
                        renderPreview();
                    } else if (e.touches.length === 2 && pinchStartDist > 0) {
                        const dx = e.touches[0].clientX - e.touches[1].clientX;
                        const dy = e.touches[0].clientY - e.touches[1].clientY;
                        const dist = Math.hypot(dx, dy);
                        setZoom(pinchStartZoom * (dist / pinchStartDist));
                    }
                },
                { passive: false }
            );

            viewport.addEventListener('touchend', (e: TouchEvent) => {
                if (e.touches.length === 1) {
                    isDragging = true;
                    lastX = e.touches[0].clientX;
                    lastY = e.touches[0].clientY;
                } else {
                    isDragging = false;
                }
            });

            const cleanupAndClose = (result: File | null) => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                URL.revokeObjectURL(objectUrl);
                modal.remove();
                resolve(result);
            };

            modal.querySelector('#avatar-crop-cancel')?.addEventListener('click', () => cleanupAndClose(null));
            modal.querySelector('#avatar-crop-cancel-top')?.addEventListener('click', () => cleanupAndClose(null));

            modal.querySelector('#avatar-crop-save')?.addEventListener('click', () => {
                try {
                    const outSize = 512;
                    const outCanvas = document.createElement('canvas');
                    outCanvas.width = outSize;
                    outCanvas.height = outSize;
                    const outCtx = outCanvas.getContext('2d')!;

                    const { w, h } = getEffectiveDimensions();
                    const minScale = Math.max(D / w, D / h);
                    const scale = minScale * zoom;
                    const exportFactor = outSize / D;

                    outCtx.fillStyle = '#090d16';
                    outCtx.fillRect(0, 0, outSize, outSize);

                    outCtx.save();
                    outCtx.translate(outSize / 2 + offsetX * exportFactor, outSize / 2 + offsetY * exportFactor);
                    outCtx.rotate((rotationQuarterTurns * Math.PI) / 2);
                    outCtx.scale(scale * exportFactor, scale * exportFactor);
                    outCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
                    outCtx.restore();

                    outCanvas.toBlob(
                        (blob) => {
                            if (!blob) {
                                cleanupAndClose(file);
                                return;
                            }
                            const baseName = (file.name || 'avatar').replace(/\.[^/.]+$/, '');
                            const croppedFile = new File([blob], `${baseName}_avatar.jpg`, {
                                type: blob.type || 'image/jpeg',
                                lastModified: Date.now()
                            });
                            cleanupAndClose(croppedFile);
                        },
                        'image/jpeg',
                        0.92
                    );
                } catch {
                    cleanupAndClose(file);
                }
            });

            renderPreview();
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(file);
        };

        img.src = objectUrl;
    });
}
(window as any).openAvatarCropperModal = openAvatarCropperModal;