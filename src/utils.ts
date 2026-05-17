import { state } from './supabase';

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

export function confirmPaidMessageModal(price: number, nickname: string, onConfirm: () => void) {
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
    
    document.getElementById('cancel-paid-msg')!.onclick = () => closeModal();
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
document.addEventListener('click', () => {
    getAudioContext();
}, { once: true });
document.addEventListener('touchstart', () => {
    getAudioContext();
}, { once: true });

export function playNotificationSound() {
    try {
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        const ctx = getAudioContext();
        if (!ctx) return;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        
        // Soft double "pop" ping
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(1.5, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0, ctx.currentTime + 0.1);
        gain.gain.linearRampToValueAtTime(1.5, ctx.currentTime + 0.11);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
        console.warn('Audio play blocked or not supported', e);
    }
}

export function closeChatMobile(skipHistoryBack = false) {
    if (!skipHistoryBack && window.location.hash === '#chat') {
        window.history.back();
        return;
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
    document.getElementById('sidebar')!.classList.remove('hidden'); 
    document.getElementById('chat-area')!.classList.add('hidden'); 
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

    notif.onclick = (e) => {
        clickCount++;
        if (clickCount === 1) {
            clickTimer = setTimeout(() => {
                clickCount = 0;
            }, 400);
        } else if (clickCount === 2) {
            clearTimeout(clickTimer);
            clickCount = 0;
            
            const chatElement = document.querySelector(`div[data-chat-id="${chatId}"]`) as HTMLElement;
            if (chatElement) {
                chatElement.click();
            } else {
                // Fallback load chat if it's not rendered in the list yet
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
    requestAnimationFrame(() => {
        notif.classList.remove('-translate-y-4', 'opacity-0');
        notif.classList.add('translate-y-0', 'opacity-100');
    });

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

export async function softDeleteCloudinaryFile(fileUrl: string): Promise<boolean> {
    try {
        const res = await fetch('/api/cloudinary/soft-delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fileUrl })
        });
        const data = await res.json();
        return data.success === true;
    } catch (e) {
        console.error("Failed to soft delete file:", e);
        return false;
    }
}

export async function uploadToCloudinary(file: File | Blob, isAvatar = false, abortSignal?: AbortSignal): Promise<string> {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '';
    if (!cloudName) {
        throw new Error("Не настроен Cloudinary (CLOUDINARY_CLOUD_NAME отсутствует)");
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'vibegram_media');

    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
            method: 'POST',
            body: formData,
            signal: abortSignal
        });
        
        if (!res.ok) {
            throw new Error(`Cloudinary upload error: ${await res.text()}`);
        }
        
        const data = await res.json();
        let url = data.secure_url;
        
        // Add compression/optimizations
        if (data.resource_type === 'image' || data.resource_type === 'video') {
             let transformations = 'f_auto,q_auto';
             if (isAvatar && data.resource_type === 'image') {
                 transformations += ',c_fill,g_face,w_256,h_256';
             } else if (data.resource_type === 'video') {
                 // Compressed video
                 transformations += ',w_800,c_limit';
             } else if (data.resource_type === 'image') {
                 // Compressed image max width
                 transformations += ',w_1600,c_limit';
             }
             url = url.replace('/upload/', `/upload/${transformations}/`);
        }
        
        return url;
    } catch (err: any) {
        if (err.name === 'AbortError') throw err;
        console.error("Cloudinary upload failed:", err);
        throw err;
    }
}
