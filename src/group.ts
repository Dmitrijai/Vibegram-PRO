import { supabase, state } from './supabase';
import { closeModal, customAlert, customConfirm, customToast } from './utils';
import { loadChats, openChat } from './chat';
import { forwardSelectedMessages, selectedMessages } from './selection';

export let isMediaSelectionMode = false;
(window as any).isMediaSelectionMode = false;
export let selectedMedia = new Set<string>();

export function toggleMediaSelectionMode(enable?: boolean) {
    isMediaSelectionMode = enable !== undefined ? enable : !isMediaSelectionMode;
    (window as any).isMediaSelectionMode = isMediaSelectionMode;
    if (!isMediaSelectionMode) {
        selectedMedia.clear();
    }
    updateMediaSelectionUI();
}

export function toggleMediaSelection(msgId: string) {
    if (selectedMedia.has(msgId)) {
        selectedMedia.delete(msgId);
    } else {
        selectedMedia.add(msgId);
    }
    updateMediaSelectionUI();
}

function updateMediaSelectionUI() {
    document.querySelectorAll('.media-item').forEach(el => {
        const msgId = el.getAttribute('data-msg-id');
        if (!msgId) return;
        
        const isSelected = selectedMedia.has(msgId);
        const checkbox = el.querySelector('.media-checkbox');
        const svg = checkbox?.querySelector('svg');
        
        if (isMediaSelectionMode) {
            checkbox?.classList.remove('hidden', 'opacity-0', 'scale-75');
            checkbox?.classList.add('opacity-100', 'scale-100');
            
            if (isSelected) {
                el.classList.add('bg-blue-50', 'dark:bg-blue-900/20', 'border-blue-200', 'dark:border-blue-800');
                if (el.classList.contains('aspect-square')) {
                    el.classList.add('opacity-80', 'scale-95');
                }
                checkbox?.classList.remove('border-gray-300', 'dark:border-gray-600', 'border-white/70', 'bg-black/20');
                checkbox?.classList.add('bg-blue-500', 'border-blue-500');
                svg?.classList.remove('opacity-0');
                svg?.classList.add('opacity-100');
            } else {
                el.classList.remove('bg-blue-50', 'dark:bg-blue-900/20', 'border-blue-200', 'dark:border-blue-800', 'opacity-80', 'scale-95');
                checkbox?.classList.remove('bg-blue-500', 'border-blue-500');
                if (el.classList.contains('aspect-square')) {
                    checkbox?.classList.add('border-white/70', 'bg-black/20');
                } else {
                    checkbox?.classList.add('border-gray-300', 'dark:border-gray-600');
                }
                svg?.classList.remove('opacity-100');
                svg?.classList.add('opacity-0');
            }
        } else {
            el.classList.remove('bg-blue-50', 'dark:bg-blue-900/20', 'border-blue-200', 'dark:border-blue-800', 'opacity-80', 'scale-95');
            if (el.classList.contains('aspect-square')) {
                checkbox?.classList.remove('opacity-100', 'scale-100');
                checkbox?.classList.add('opacity-0', 'scale-75');
            } else {
                checkbox?.classList.add('hidden');
            }
        }
    });
    
    let bar = document.getElementById('media-selection-action-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'media-selection-action-bar';
        bar.className = 'absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between z-50 transform transition-transform duration-300 translate-y-full rounded-b-3xl';
        bar.innerHTML = `
            <div class="flex items-center gap-4">
                <button onclick="toggleMediaSelectionMode(false)" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium">Отмена</button>
                <span id="media-selection-count" class="font-bold text-gray-800 dark:text-gray-100">0</span>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="downloadSelectedMedia()" class="p-2 text-gray-600 hover:text-green-500 dark:text-gray-300 dark:hover:text-green-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Скачать">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                </button>
                <button onclick="forwardSelectedMedia()" class="p-2 text-gray-600 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Переслать">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"></path></svg>
                </button>
                <button onclick="deleteSelectedMedia()" class="p-2 text-gray-600 hover:text-red-500 dark:text-gray-300 dark:hover:text-red-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Удалить">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
        document.getElementById('modal-content')?.appendChild(bar);
    }
    
    const countEl = document.getElementById('media-selection-count');
    if (countEl) countEl.textContent = selectedMedia.size.toString();
    
    if (isMediaSelectionMode) {
        bar.classList.remove('translate-y-full');
        const tabContainer = document.getElementById('chat-info-tab-container');
        if (tabContainer) tabContainer.style.paddingBottom = '3rem';
        const scrollContainer = document.querySelector('#modal-content .overflow-y-auto') as HTMLElement;
        if (scrollContainer) {
            scrollContainer.style.paddingBottom = '4.5rem';
            scrollContainer.scrollBy({ top: 48, behavior: 'smooth' });
        }
    } else {
        bar.classList.add('translate-y-full');
        const tabContainer = document.getElementById('chat-info-tab-container');
        if (tabContainer) tabContainer.style.paddingBottom = '';
        const scrollContainer = document.querySelector('#modal-content .overflow-y-auto') as HTMLElement;
        if (scrollContainer) {
            scrollContainer.style.paddingBottom = '0rem'; // Remove extra bottom padding, uses pb-4 via classes
        }
    }
}

export async function downloadSelectedMedia() {
    if (selectedMedia.size === 0) return;
    
    const ids = Array.from(selectedMedia);
    try {
        const { data, error } = await supabase.from('messages').select('media').in('id', ids);
        if (error) throw error;
        
        if (data) {
            let count = 0;
            customToast(`Подготовка к скачиванию...`);
            for (const msg of data) {
                if (msg.media && Array.isArray(msg.media)) {
                    for (const m of msg.media) {
                        if (m.url) {
                            await (window as any).downloadMedia(m.url, m.name || 'media');
                            count++;
                            // Small delay to prevent browser blocking multiple downloads
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    }
                }
            }
            customToast(`Скачано файлов: ${count}`);
            toggleMediaSelectionMode(false);
        }
    } catch (e) {
        console.error('Error downloading media:', e);
        customToast('Ошибка при скачивании');
    }
}
(window as any).downloadSelectedMedia = downloadSelectedMedia;

export async function deleteSelectedMedia() {
    if (selectedMedia.size === 0) return;
    
    const confirmed = await customConfirm(`Удалить ${selectedMedia.size} сообщений?`);
    if (confirmed) {
        const ids = Array.from(selectedMedia);
        try {
            const { data: myMsgs } = await supabase.from('messages').select('id').in('id', ids).eq('sender_id', state.currentUser.id);
            const myIds = myMsgs?.map(m => m.id) || [];
            
            if (myIds.length === 0) {
                customToast('Вы можете удалять только свои сообщения');
                toggleMediaSelectionMode(false);
                return;
            }
            
            if (myIds.length < ids.length) {
                customToast('Чужие сообщения не будут удалены');
            }

            const { error } = await supabase.from('messages').delete().in('id', myIds);
            if (error) throw error;
            
            myIds.forEach(id => {
                const el = document.getElementById(`msg-wrapper-${id}`);
                if (el) el.remove();
                
                const mediaEl = document.querySelector(`.media-item[data-msg-id="${id}"]`);
                if (mediaEl) mediaEl.remove();
            });
            
            toggleMediaSelectionMode(false);
            customToast('Сообщения удалены');
        } catch (e) {
            console.error('Error deleting messages:', e);
            customToast('Ошибка при удалении');
        }
    }
}

export async function forwardSelectedMedia() {
    if (selectedMedia.size === 0) return;
    
    // Copy selected media to selected messages
    selectedMessages.clear();
    selectedMedia.forEach(id => selectedMessages.add(id));
    
    // Use the existing forward logic
    forwardSelectedMessages();
}

let memberLongPressTimer: any;

export function startMemberLongPress(e: Event, userId: string, role: string, isCreator: boolean) {
    (window as any).isMemberLongPressOpen = false;
    memberLongPressTimer = setTimeout(() => {
        (window as any).isMemberLongPressOpen = true;
        showMemberManageMenu(e, userId, role, isCreator);
    }, 500);
}

export function cancelMemberLongPress() {
    clearTimeout(memberLongPressTimer);
    setTimeout(() => {
        (window as any).isMemberLongPressOpen = false;
    }, 100);
}

export function showMemberManageMenu(e: Event, userId: string, role: string, isCreator: boolean) {
    e.preventDefault();
    e.stopPropagation();
    
    document.getElementById('member-context-menu')?.remove();
    
    if (userId === state.currentUser?.id || role === 'creator') return;

    const menu = document.createElement('div');
    menu.id = 'member-context-menu';
    menu.className = 'fixed bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 z-[9999] min-w-[200px] modal-enter overflow-hidden';
    
    let clientX = 0;
    let clientY = 0;
    if ((e as TouchEvent).touches) {
        clientX = (e as TouchEvent).touches[0].clientX;
        clientY = (e as TouchEvent).touches[0].clientY;
    } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
    }
    
    const modalContent = document.getElementById('modal-content');
    let minX = 0, minY = 0, maxX = window.innerWidth, maxY = window.innerHeight;
    if (modalContent) {
        const rect = modalContent.getBoundingClientRect();
        minX = rect.left;
        minY = rect.top;
        maxX = rect.right;
        maxY = rect.bottom;
    }
    
    // Estimate menu size based on content (~110px height max if two buttons are visible)
    const menuWidth = 200;
    const menuHeight = 120;
    
    let left = clientX;
    let top = clientY;
    
    // Restrict within modal bounds if outside
    if (left + menuWidth > maxX) left = maxX - menuWidth - 10;
    if (left < minX) left = minX + 10;
    if (top + menuHeight > maxY) top = maxY - menuHeight - 10;
    if (top < minY) top = minY + 10;
    
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    let html = '';

    if (isCreator && role !== 'admin') {
        html += `<button onclick="promoteToAdmin('${userId}'); document.getElementById('member-context-menu')?.remove();" class="w-full text-left px-4 py-3 text-sm text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"><svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 11l7-7 7 7M5 19l7-7 7 7"></path></svg> Сделать админом</button>`;
    }
    if (isCreator && role === 'admin') {
        html += `<button onclick="demoteAdmin('${userId}'); document.getElementById('member-context-menu')?.remove();" class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"><svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 13l-7 7-7-7m14-8l-7 7-7-7"></path></svg> Разжаловать</button>`;
    }
    html += `<button onclick="kickMember('${userId}'); document.getElementById('member-context-menu')?.remove();" class="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-3 transition-colors"><svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg> Удалить участника</button>`;

    menu.innerHTML = html;
    document.body.appendChild(menu);

    const closeMenu = (ev: Event) => {
        if (!(ev.target as HTMLElement).closest('#member-context-menu')) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
            document.removeEventListener('touchstart', closeMenu, {capture: true});
            if (modalContent) {
                modalContent.removeEventListener('click', closeMenu, {capture: true});
                modalContent.removeEventListener('touchstart', closeMenu, {capture: true});
                const scrollContainer = modalContent.querySelector('.overflow-y-auto');
                if (scrollContainer) {
                    scrollContainer.removeEventListener('scroll', closeMenu, {capture: true});
                }
            }
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
        document.addEventListener('touchstart', closeMenu, {capture: true});
        if (modalContent) {
            modalContent.addEventListener('click', closeMenu, {capture: true});
            modalContent.addEventListener('touchstart', closeMenu, {capture: true});
            const scrollContainer = modalContent.querySelector('.overflow-y-auto');
            if (scrollContainer) {
                scrollContainer.addEventListener('scroll', closeMenu, {capture: true});
            }
        }
    }, 10);
}

(window as any).startMemberLongPress = startMemberLongPress;
(window as any).cancelMemberLongPress = cancelMemberLongPress;
(window as any).showMemberManageMenu = showMemberManageMenu;

let longPressTimer: any;
let isLongPressing = false;
(window as any).isLongPressing = false;

export function startMediaLongPress(e: Event, msgId: string, url: string, name: string) {
    isLongPressing = false;
    (window as any).isLongPressing = false;
    longPressTimer = setTimeout(() => {
        isLongPressing = true;
        (window as any).isLongPressing = true;
        showMediaContextMenu(e, msgId, url, name);
    }, 500);
}

export function cancelMediaLongPress() {
    clearTimeout(longPressTimer);
    setTimeout(() => {
        isLongPressing = false;
        (window as any).isLongPressing = false;
    }, 100);
}

export function showMediaContextMenu(e: Event, msgId: string, url: string, name: string) {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove existing menu if any
    document.getElementById('media-context-menu')?.remove();
    
    const menu = document.createElement('div');
    menu.id = 'media-context-menu';
    menu.className = 'fixed bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 z-[100] min-w-[160px] modal-enter';
    
    // Position menu near touch/click
    let clientX = 0;
    let clientY = 0;
    if ((e as TouchEvent).touches) {
        clientX = (e as TouchEvent).touches[0].clientX;
        clientY = (e as TouchEvent).touches[0].clientY;
    } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
    }
    
    menu.style.left = `${Math.min(clientX, window.innerWidth - 170)}px`;
    menu.style.top = `${Math.min(clientY, window.innerHeight - 150)}px`;
    
    menu.innerHTML = `
        <button onclick="closeMediaContextMenu(); toggleMediaSelectionMode(true); toggleMediaSelection('${msgId}');" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            Выбрать
        </button>
        <button onclick="closeMediaContextMenu(); downloadMedia('${url}', '${name}')" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Скачать
        </button>
        <button onclick="closeMediaContextMenu(); closeModal(); setTimeout(() => jumpToMessage('${msgId}'), 300)" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
            Показать в чате
        </button>
    `;
    
    document.body.appendChild(menu);
    
    // Close when clicking outside
    const closeHandler = (ev: Event) => {
        if (!menu.contains(ev.target as Node)) {
            closeMediaContextMenu();
            document.removeEventListener('mousedown', closeHandler);
            document.removeEventListener('touchstart', closeHandler);
        }
    };
    setTimeout(() => {
        document.addEventListener('mousedown', closeHandler);
        document.addEventListener('touchstart', closeHandler);
    }, 10);
}

export function closeMediaContextMenu() {
    document.getElementById('media-context-menu')?.remove();
}

export function toggleCirclePlay(element: HTMLElement, url: string) {
    const video = element.querySelector('video');
    const overlay = element.querySelector('.play-overlay');
    if (!video) return;
    
    if (video.paused) {
        // Pause all other media
        document.querySelectorAll('audio, video').forEach(media => {
            if (media !== video) (media as HTMLMediaElement).pause();
        });
        document.querySelectorAll('.play-icon').forEach(icon => icon.classList.remove('hidden'));
        document.querySelectorAll('.pause-icon').forEach(icon => icon.classList.add('hidden'));
        document.querySelectorAll('.play-overlay').forEach(overlay => overlay.classList.remove('hidden'));
        
        video.play().catch(e => {
            console.error('Error playing circle:', e);
            customToast('Ошибка воспроизведения');
        });
        video.muted = false;
        if (overlay) overlay.classList.add('hidden');
    } else {
        video.pause();
        if (overlay) overlay.classList.remove('hidden');
    }
}

export async function openChatInfo(skipPushState = false) {
    if (!state.activeChatId) return;

    if (!skipPushState && window.location.hash !== '#info') {
        window.history.pushState({ screen: 'info' }, '', '#info');
    }

    if (state.isTechSupportChat && !state.currentProfile?.settings?.is_tech_support) {
        return;
    }

    const modal = document.getElementById('modal-content')!;
    modal.classList.remove('overflow-y-auto', 'p-6');
    modal.classList.add('flex', 'flex-col', 'overflow-hidden', 'p-0');
    
    const name = document.getElementById('current-chat-name')!.innerText;
    const isChannel = state.activeChatType === 'channel';
    
    const isSavedMessages = !state.activeChatIsGroup && (!state.activeChatMembers || state.activeChatMembers.filter((m: any) => m.user_id !== state.currentUser.id).length === 0);

    // Build avatar properly
    let avatarUrl = state.activeChatIsGroup ? state.activeChatAvatarUrl : state.activeChatOtherUser?.avatar_url;
    if (state.activeChatIsGroup && !avatarUrl) {
        const { data: chatData } = await supabase.from('chats').select('avatar_url').eq('id', state.activeChatId).single();
        if (chatData?.avatar_url) avatarUrl = chatData.avatar_url;
    }
    let isPremiumUser = false;
    if (!state.activeChatIsGroup && state.activeChatOtherUser) {
        isPremiumUser = state.activeChatOtherUser.is_premium && (!state.activeChatOtherUser.premium_until || new Date(state.activeChatOtherUser.premium_until) > new Date());
    }
    
    const premiumBadgeHtml = isPremiumUser ? `<div class="absolute bottom-0 right-0 translate-x-1.5 translate-y-1.5 bg-white dark:bg-gray-800 rounded-full p-1 shadow-sm border-2 border-white dark:border-gray-900 z-50 w-8 h-8 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : '';
    
    let avatarHtml;
    if (isSavedMessages) {
        avatarHtml = `<div class="w-full h-full relative rounded-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-bold text-4xl shadow-sm">И</div>`;
    } else {
        const avatarInnerHtml = avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full">` : `${(name && name[0]) ? name[0].toUpperCase() : 'U'}`;
        avatarHtml = `<div class="w-full h-full relative rounded-full flex items-center justify-center ${!avatarUrl ? (state.activeChatIsGroup ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white font-bold text-4xl' : 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-bold text-4xl') : ''}">${avatarInnerHtml}${premiumBadgeHtml}</div>`;
    }
    
    let usernameHtml = '';
    if (state.activeChatIsGroup) {
        const { data: chatData } = await supabase.from('chats').select('username').eq('id', state.activeChatId).single();
        if (chatData?.username) {
            usernameHtml = `<div class="text-sm text-blue-500 text-center select-all mt-1 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors" onclick="navigator.clipboard.writeText('@${chatData.username}'); const old=this.innerHTML; this.innerHTML='✅ Скопировано'; setTimeout(()=>this.innerHTML=old, 2000);" title="Копировать ID">@${chatData.username}</div>`;
        }
    } else if (!isSavedMessages) {
        const { data: userData } = await supabase.from('profiles').select('username').eq('id', state.activeChatOtherUser?.id).single();
        if(userData?.username) {
            usernameHtml = `<div class="text-sm text-blue-500 text-center select-all mt-1 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors" onclick="navigator.clipboard.writeText('@${userData.username}'); const old=this.innerHTML; this.innerHTML='✅ Скопировано'; setTimeout(()=>this.innerHTML=old, 2000);" title="Копировать ID">@${userData.username}</div>`;
        }
    }
    
    const { data: profile } = await supabase.from('profiles').select('settings').eq('id', state.currentUser.id).single();
    const settings = profile?.settings || {};
    const mutedChats = settings.muted_chats || [];
    const isMuted = mutedChats.includes(state.activeChatId);

    const muteBtnHtml = `
        <button onclick="toggleMuteChat()" class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors flex items-center justify-between font-medium">
            <div class="flex items-center gap-3">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>
                Без звука
            </div>
            <div class="w-10 h-5 bg-${isMuted ? 'blue-500' : 'gray-300 dark:bg-gray-600'} rounded-full relative transition-colors">
                <div class="w-4 h-4 bg-white rounded-full absolute top-0.5 ${isMuted ? 'right-0.5' : 'left-0.5'} transition-all shadow-sm"></div>
            </div>
        </button>
    `;

    let infoHtml = '';
    
    if (isSavedMessages) {
        const isShown = settings.show_saved_messages !== false;
        infoHtml = `
            <div class="mt-6 w-full bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl">
                <div class="mb-4">
                    <div class="text-[11px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider mb-2">Настройки Избранного</div>
                    <div class="flex items-center justify-between mb-3 bg-white dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-200">Показывать в списке чатов</span>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="saved-messages-toggle" class="sr-only peer" ${isShown ? 'checked' : ''} onchange="toggleSavedMessagesVisibility(this.checked)">
                            <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
                        </label>
                    </div>
                </div>
            </div>
            <div class="mt-4 w-full space-y-2">
                <button onclick="clearHistory()" class="w-full text-left px-4 py-3 text-sm text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-xl transition-colors flex items-center gap-3 font-medium">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Очистить историю
                </button>
            </div>
        `;
    } else if (state.activeChatIsGroup) {
        const { data: members } = await supabase.from('chat_members').select('role, user_id, profiles(id, username, display_name, avatar_url, is_online)').eq('chat_id', state.activeChatId);
        const myRole = members?.find((m: any) => m.user_id === state.currentUser.id)?.role;
        const canManage = myRole === 'creator' || myRole === 'admin' || state.isAdminStatus;
        const isCreator = myRole === 'creator' || state.isAdminStatus;
        
        const pendingMembers = members?.filter(m => m.role === 'pending') || [];
        const activeMembers = members?.filter(m => m.role !== 'pending') || [];
        
        infoHtml = `
            <div class="mt-6 w-full">
                ${canManage ? `
                <div class="mb-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl">
                    <div class="text-[11px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider mb-2">Настройки ${isChannel ? 'канала' : 'группы'}</div>
                    <button onclick="document.getElementById('group-avatar-upload').click()" class="text-sm text-blue-500 hover:text-blue-600 mb-2 block font-medium">Изменить аватарку</button>
                    <input type="file" id="group-avatar-upload" accept="image/*" class="hidden" onchange="uploadGroupAvatar(event)">
                    <textarea id="group-description-input" onchange="saveGroupSettings()" placeholder="Описание ${isChannel ? 'канала' : 'группы'}..." class="w-full p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm mb-2 resize-none h-20">${state.activeChatDescription || ''}</textarea>
                    <div class="flex items-center justify-between mb-3 bg-white dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-200">${isChannel ? 'Публичный канал' : 'Публичная группа'}</span>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="channel-public-toggle" onchange="saveGroupSettings()" class="sr-only peer" ${state.activeChatIsPublic ? 'checked' : ''}>
                            <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
                        </label>
                    </div>
                </div>
                ` : `
                ${state.activeChatDescription ? `
                <div class="mb-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl">
                    <div class="text-[11px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider mb-1">Описание</div>
                    <div class="text-gray-800 dark:text-gray-200 font-medium text-sm">${state.activeChatDescription}</div>
                </div>
                ` : ''}
                `}
                
                ${canManage && pendingMembers.length > 0 ? `
                <h4 class="text-sm font-bold text-orange-500 uppercase tracking-wider mb-3">Заявки на вступление (${pendingMembers.length})</h4>
                <div class="space-y-3 max-h-40 overflow-y-auto pr-2 mb-4">
                    ${pendingMembers.map((m: any) => `
                        <div class="flex items-center justify-between p-2 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold text-xs shrink-0">${(m.profiles?.display_name || m.profiles?.username || 'U')[0].toUpperCase()}</div>
                                <span class="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate block">${m.profiles?.display_name || m.profiles?.username}</span>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="approveJoinRequest('${m.user_id}')" class="text-green-500 hover:bg-green-100 p-1.5 rounded-lg"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></button>
                                <button onclick="rejectJoinRequest('${m.user_id}')" class="text-red-500 hover:bg-red-100 p-1.5 rounded-lg"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}

                <h4 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex flex-wrap gap-2 justify-between items-center">
                    <div>${isChannel ? 'Подписчики' : 'Участники'} ${isChannel && !canManage ? '' : `(${activeMembers.length})`}</div>
                    <div class="flex flex-wrap gap-2">
                        ${canManage && !isChannel ? `<button onclick="openAddMemberModal()" class="text-blue-500 hover:text-blue-600 flex items-center gap-1 border border-blue-500 rounded p-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> Добавить</button>` : ''}
                        ${canManage ? `<button onclick="generateInviteKey()" class="text-blue-500 hover:text-blue-600 flex items-center gap-1 border border-blue-500 rounded p-1 whitespace-nowrap"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4v-3l8.44-8.44A6 6 0 0115 7z"></path></svg> Ключ-приглашение</button>` : ''}
                    </div>
                </h4>
                ${isChannel && !canManage ? '<div class="text-xs text-gray-500 mb-4 px-2">Список подписчиков скрыт администраторами.</div>' : `
                <div class="space-y-3 max-h-60 overflow-y-auto pr-2 mb-4">
                    ${activeMembers.map((m: any) => `
                        <div ${canManage && m.user_id !== state.currentUser.id && m.role !== 'creator' ? `oncontextmenu="window.showMemberManageMenu(event, '${m.user_id}', '${m.role}', ${isCreator})" ontouchstart="window.startMemberLongPress(event, '${m.user_id}', '${m.role}', ${isCreator})" ontouchend="window.cancelMemberLongPress()" ontouchmove="window.cancelMemberLongPress()" ontouchcancel="window.cancelMemberLongPress()"` : ''} onclick="if((window as any).isMemberLongPressOpen || event.target.closest('button') || '${m.user_id}' === '${state.currentUser.id}') return; startDirectChatById('${m.user_id}')" class="${m.user_id !== state.currentUser.id ? 'cursor-pointer' : ''} flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors group" title="${m.user_id !== state.currentUser.id ? 'Написать сообщение' : ''}">
                            <div class="flex items-center gap-3 min-w-0 pointer-events-none">
                                <div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-500 dark:text-blue-400 font-bold relative shrink-0">
                                    ${m.profiles.avatar_url ? `<img src="${m.profiles.avatar_url}" class="w-full h-full object-cover rounded-full">` : (m.profiles.display_name || m.profiles.username || 'U')[0].toUpperCase()}
                                    ${m.profiles.is_premium && (!m.profiles.premium_until || new Date(m.profiles.premium_until) > new Date()) ? `<div class="absolute -top-1 -left-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm border border-gray-200 dark:border-gray-700 z-50"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-3 h-3 object-contain" alt="Premium"></div>` : ''}
                                    ${m.profiles.is_online ? '<div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-10"></div>' : ''}
                                </div>
                                <div class="min-w-0">
                                    <div class="font-semibold text-gray-800 dark:text-gray-100 truncate flex items-center">${m.profiles.display_name || m.profiles.username} ${m.user_id === state.currentUser.id ? '(Вы)' : ''}</div>
                                    <div class="text-xs text-gray-500 dark:text-gray-400 truncate">${m.profiles.is_online ? 'в сети' : 'был(а) недавно'}</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                ${m.role === 'creator' ? '<span class="text-xs font-bold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-lg pointer-events-none">Создатель</span>' : ''}
                                ${m.role === 'admin' ? '<span class="text-xs font-bold text-purple-500 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded-lg pointer-events-none">Админ</span>' : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>`}
                <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2 space-y-2">
                    ${muteBtnHtml}
                    ${canManage ? `
                    <button onclick="clearHistory()" class="w-full text-left px-4 py-3 text-sm text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-xl transition-colors flex items-center gap-3 font-medium">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        Очистить историю
                    </button>
                    <button onclick="deleteChat()" class="hidden"></button>
                    ${isCreator ? `
                    <button onclick="deleteChat()" class="w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors flex items-center gap-3 font-medium">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        Удалить ${isChannel ? 'канал' : 'группу'}
                    </button>
                    ` : ''}
                    ` : ''}
                    <button onclick="leaveGroup()" class="w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors flex items-center gap-3 font-medium">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3-3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        Покинуть ${isChannel ? 'канал' : 'группу'}
                    </button>
                </div>
            </div>
        `;
    } else if (state.activeChatOtherUser) {
        const bio = state.activeChatOtherUser.bio || 'Информация отсутствует';
        const username = state.activeChatOtherUser.username;
        const otherUserId = state.activeChatOtherUser.id;
        const isBlocked = (profile?.settings?.blocked_users || []).includes(otherUserId);
        infoHtml = `
            <div class="mt-6 w-full bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl">
                <div class="mb-4">
                    <div class="text-[11px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider mb-1">О себе</div>
                    <div class="text-gray-800 dark:text-gray-200 font-medium">${bio}</div>
                </div>
                <div>
                    <div class="text-[11px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider mb-1">Имя пользователя</div>
                    <div class="text-gray-800 dark:text-gray-200 font-medium">@${username}</div>
                </div>
                ${username ? `
                <div class="mt-4">
                    <button onclick="if(window.sendVibToUserModal) { window.sendVibToUserModal('${username}'); }" class="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0">
                        <div class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-tr from-yellow-300 to-amber-500 border border-white/50 animate-pulse">
                            <svg class="w-3 h-3 text-yellow-900" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z" clip-rule="evenodd"></path></svg>
                        </div>
                        Отправить VIB
                    </button>
                </div>
                ` : ''}
            </div>
            <div class="mt-4 w-full space-y-2">
                ${muteBtnHtml}
                <button onclick="toggleBlockUser('${otherUserId}')" class="w-full text-left px-4 py-3 text-sm ${isBlocked ? 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700' : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'} rounded-xl transition-colors flex items-center gap-3 font-medium">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
                    ${isBlocked ? 'Разблокировать пользователя' : 'Заблокировать пользователя'}
                </button>
                <button onclick="clearHistory()" class="w-full text-left px-4 py-3 text-sm text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-xl transition-colors flex items-center gap-3 font-medium">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Очистить историю
                </button>
                <button onclick="deleteChat()" class="w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors flex items-center gap-3 font-medium">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Удалить чат
                </button>
            </div>
        `;
    }

    // Fetch media for tabs
    const { data: messagesWithMedia } = await supabase
        .from('messages')
        .select('id, media, message_type, created_at')
        .eq('chat_id', state.activeChatId)
        .not('media', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);

    let photosVideos: any[] = [];
    let files: any[] = [];
    let audioVideo: any[] = [];

    messagesWithMedia?.forEach(msg => {
        if (!msg.media) return;
        const actualMedia = msg.media.filter((m: any) => m.type !== 'reply' && m.type !== 'forward');
        if (actualMedia.length === 0) return;

        if (msg.message_type === 'voice') {
            audioVideo.push({ msgId: msg.id, media: actualMedia[0], date: msg.created_at, type: 'voice' });
        } else if (msg.message_type === 'video_circle') {
            audioVideo.push({ msgId: msg.id, media: actualMedia[0], date: msg.created_at, type: 'circle' });
        } else if (msg.message_type === 'poll') {
            // Do not add polls to media tabs
            return;
        } else {
            actualMedia.forEach((m: any) => {
                if (m.type?.startsWith('image/') || m.type?.startsWith('video/')) {
                    if (m.asFile) files.push({ msgId: msg.id, media: m, date: msg.created_at });
                    else photosVideos.push({ msgId: msg.id, media: m, date: msg.created_at });
                } else if (m.type?.startsWith('audio/')) {
                    audioVideo.push({ msgId: msg.id, media: m, date: msg.created_at, type: 'voice' });
                } else {
                    files.push({ msgId: msg.id, media: m, date: msg.created_at });
                }
            });
        }
    });
    
    audioVideo.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const hasAnyMedia = photosVideos.length > 0 || files.length > 0 || audioVideo.length > 0;
    let mediaContentHtml = '';

    const renderMediaGrid = (items: any[]) => `
        <div class="grid grid-cols-3 gap-1 mt-4">
            ${items.map(item => `
                <div class="media-item aspect-square relative group cursor-pointer bg-gray-100 dark:bg-gray-800 overflow-hidden transition-all duration-200 rounded-xl select-none" data-msg-id="${item.msgId}"
                     style="-webkit-touch-callout: none; -webkit-user-select: none;"
                     oncontextmenu="event.preventDefault();"
                     onmousedown="startMediaLongPress(event, '${item.msgId}', '${item.media.url}', '${item.media.name || ''}')" 
                     onmouseup="cancelMediaLongPress()" 
                     onmouseleave="cancelMediaLongPress()"
                     ontouchstart="startMediaLongPress(event, '${item.msgId}', '${item.media.url}', '${item.media.name || ''}')" 
                     ontouchend="cancelMediaLongPress()" 
                     ontouchcancel="cancelMediaLongPress()"
                     onclick="if(window.isMediaSelectionMode) { toggleMediaSelection('${item.msgId}'); } else if(!window.isLongPressing) openLightbox('${item.media.url}')">
                    
                    <div class="media-checkbox absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center z-20 pointer-events-none transition-all duration-200 opacity-0 scale-75 hidden">
                        <svg class="w-3 h-3 text-white opacity-0 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    
                    ${item.media.type?.startsWith('image/') ? 
                        `<img src="${item.media.url}" draggable="false" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 pointer-events-none" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<div class=\\'w-full h-full flex items-center justify-center text-xs text-red-500 p-2 text-center\\'>Повреждено</div>';">` : 
                        `<video src="${item.media.url}" draggable="false" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 pointer-events-none" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'w-full h-full flex items-center justify-center text-xs text-red-500 p-2 text-center\\'>Повреждено</div>';"></video><div class="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none"><svg class="w-8 h-8 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>`
                    }
                </div>
            `).join('')}
        </div>
    `;

    const renderFileList = (items: any[]) => `
        <div class="flex flex-col gap-2 mt-4">
            ${items.map(item => `
                <div class="media-item flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-all duration-200 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 select-none" data-msg-id="${item.msgId}"
                     style="-webkit-touch-callout: none; -webkit-user-select: none;"
                     oncontextmenu="event.preventDefault();"
                     onmousedown="startMediaLongPress(event, '${item.msgId}', '${item.media.url}', '${item.media.name || ''}')" 
                     onmouseup="cancelMediaLongPress()" 
                     onmouseleave="cancelMediaLongPress()"
                     ontouchstart="startMediaLongPress(event, '${item.msgId}', '${item.media.url}', '${item.media.name || ''}')" 
                     ontouchend="cancelMediaLongPress()" 
                     ontouchcancel="cancelMediaLongPress()"
                     onclick="if(window.isMediaSelectionMode) { toggleMediaSelection('${item.msgId}'); } else if(!window.isLongPressing) window.open('${item.media.url}', '_blank')">
                    
                    <div class="media-checkbox w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 pointer-events-none transition-all duration-200 hidden">
                        <svg class="w-3 h-3 text-white opacity-0 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>

                    <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center text-blue-500 shrink-0 pointer-events-none shadow-sm">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                    </div>
                    <div class="flex-1 min-w-0 pointer-events-none">
                        <div class="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">${item.media.name || 'Файл'}</div>
                        <div class="text-xs text-gray-500 mt-0.5">${(item.media.size / 1024 / 1024).toFixed(2)} MB • ${new Date(item.date).toLocaleDateString()}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    const renderAudioVideoList = (items: any[]) => `
        <div class="flex flex-col gap-2 mt-4">
            ${items.map(item => {
                if (item.type === 'voice') {
                    return `
                        <div class="media-item flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-all duration-200 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 select-none" data-msg-id="${item.msgId}"
                             style="-webkit-touch-callout: none; -webkit-user-select: none;"
                             oncontextmenu="event.preventDefault();"
                             onmousedown="startMediaLongPress(event, '${item.msgId}', '${item.media.url}', 'Голосовое сообщение')" 
                             onmouseup="cancelMediaLongPress()" 
                             onmouseleave="cancelMediaLongPress()"
                             ontouchstart="startMediaLongPress(event, '${item.msgId}', '${item.media.url}', 'Голосовое сообщение')" 
                             ontouchend="cancelMediaLongPress()" 
                             ontouchcancel="cancelMediaLongPress()"
                             onclick="if(window.isMediaSelectionMode) { toggleMediaSelection('${item.msgId}'); } else if(!window.isLongPressing) toggleAudio(this, '${item.media.url}')">
                            
                            <div class="media-checkbox w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 pointer-events-none transition-all duration-200 hidden">
                                <svg class="w-3 h-3 text-white opacity-0 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                            </div>

                            <div class="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white shrink-0 pointer-events-none shadow-md">
                                <svg class="w-5 h-5 ml-0.5 play-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                <svg class="w-5 h-5 pause-icon hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                            </div>
                            <div class="flex-1 min-w-0 pointer-events-none">
                                <div class="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">Голосовое сообщение</div>
                                <div class="text-xs text-gray-500 mt-0.5">${new Date(item.date).toLocaleDateString()}</div>
                            </div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="media-item flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-all duration-200 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 select-none" data-msg-id="${item.msgId}"
                             style="-webkit-touch-callout: none; -webkit-user-select: none;"
                             oncontextmenu="event.preventDefault();"
                             onmousedown="startMediaLongPress(event, '${item.msgId}', '${item.media.url}', 'Видеокружок')" 
                             onmouseup="cancelMediaLongPress()" 
                             onmouseleave="cancelMediaLongPress()"
                             ontouchstart="startMediaLongPress(event, '${item.msgId}', '${item.media.url}', 'Видеокружок')" 
                             ontouchend="cancelMediaLongPress()" 
                             ontouchcancel="cancelMediaLongPress()"
                             onclick="if(window.isMediaSelectionMode) { toggleMediaSelection('${item.msgId}'); } else if(!window.isLongPressing) toggleCirclePlay(this, '${item.media.url}')">
                            
                            <div class="media-checkbox w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 pointer-events-none transition-all duration-200 hidden">
                                <svg class="w-3 h-3 text-white opacity-0 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                            </div>

                            <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-blue-500 shrink-0 pointer-events-none relative shadow-md">
                                <video src="${item.media.url}" class="w-full h-full object-cover pointer-events-none" draggable="false" preload="metadata" muted loop playsinline onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'w-full h-full flex items-center justify-center bg-red-100 dark:bg-red-900/30 text-red-500\\'><svg class=\\'w-5 h-5\\' fill=\\'none\\' stroke=\\'currentColor\\' viewBox=\\'0 0 24 24\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z\\'></path></svg></div>';"></video>
                                <div class="absolute inset-0 bg-black/20 flex items-center justify-center play-overlay">
                                    <svg class="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                </div>
                            </div>
                            <div class="flex-1 min-w-0 pointer-events-none">
                                <div class="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">Видеосообщение</div>
                                <div class="text-xs text-gray-500 mt-0.5">${new Date(item.date).toLocaleDateString()}</div>
                            </div>
                        </div>
                    `;
                }
            }).join('')}
        </div>
    `;

    mediaContentHtml = `
        <div class="w-full mt-6 flex flex-col">
            <div class="bg-transparent mb-4">
                <div class="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto hide-scrollbar">
                    <button class="px-4 py-2 text-sm font-medium text-blue-500 border-b-2 border-blue-500 whitespace-nowrap" id="chat-info-btn-info" onclick="switchChatInfoTab('info', this)">Информация</button>
                    <button class="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap" id="chat-info-btn-media" onclick="switchChatInfoTab('media', this)">Медиа</button>
                    <button class="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap" id="chat-info-btn-files" onclick="switchChatInfoTab('files', this)">Файлы</button>
                    <button class="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap" id="chat-info-btn-audiovideo" onclick="switchChatInfoTab('audiovideo', this)">Голосовые</button>
                </div>
            </div>
            <div id="chat-info-tab-container" class="w-full pt-2 transition-all duration-300 pb-4">
                <div id="chat-info-tab-info" class="w-full tab-content block">
                    ${infoHtml}
                </div>
                <div id="chat-info-tab-media" class="w-full tab-content hidden">${photosVideos.length > 0 ? renderMediaGrid(photosVideos) : '<div class="text-center text-gray-500 py-4">Нет медиа</div>'}</div>
                <div id="chat-info-tab-files" class="w-full tab-content hidden">${files.length > 0 ? renderFileList(files) : '<div class="text-center text-gray-500 py-4">Нет файлов</div>'}</div>
                <div id="chat-info-tab-audiovideo" class="w-full tab-content hidden">${audioVideo.length > 0 ? renderAudioVideoList(audioVideo) : '<div class="text-center text-gray-500 py-4">Нет голосовых</div>'}</div>
            </div>
        </div>
    `;

    modal.innerHTML = `
        <div class="flex justify-between items-center p-6 pb-4 shrink-0 border-b border-gray-100 dark:border-gray-800">
            <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">Информация</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto px-6 pt-4 custom-scrollbar flex flex-col items-center">
            <div class="w-28 h-28 rounded-full flex items-center justify-center text-white text-5xl font-bold mb-4 shadow-md shrink-0 bg-gradient-to-br relative ${state.activeChatIsGroup ? 'from-emerald-400 to-teal-500' : 'from-blue-400 to-indigo-500'}">
                ${avatarHtml}
            </div>
            <div class="font-bold text-2xl text-gray-800 dark:text-gray-100 text-center shrink-0 truncate w-full max-w-full px-4">${name}</div>
            ${usernameHtml}
            ${!state.activeChatIsGroup ? `<div class="text-sm text-gray-500 dark:text-gray-400 mt-1 shrink-0">${state.activeChatOtherUser?.is_online ? 'в сети' : 'был(а) недавно'}</div>` : ''}
            ${mediaContentHtml}
            <div class="h-4 shrink-0 w-full"></div>
        </div>
    `;
    document.getElementById('modal-overlay')!.classList.remove('hidden');
}

export function switchChatInfoTab(tabId: string, btn: HTMLElement) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('block');
    });
    
    // Show selected tab
    const target = document.getElementById(`chat-info-tab-${tabId}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('block');
    }
    
    // Update button styles
    const buttons = btn.parentElement?.querySelectorAll('button');
    buttons?.forEach(b => {
        b.classList.remove('text-blue-500', 'border-b-2', 'border-blue-500');
        b.classList.add('text-gray-500');
    });
    
    btn.classList.remove('text-gray-500');
    btn.classList.add('text-blue-500', 'border-b-2', 'border-blue-500');
}

export async function jumpToMessage(msgId: string) {
    closeModal();
    let msgEl = document.getElementById(`msg-wrapper-${msgId}`);
    let innerMsgEl = document.getElementById(`msg-${msgId}`);
    
    if (!msgEl || !innerMsgEl) {
        const { loadMessagesUntil } = await import('./messages');
        const found = await loadMessagesUntil(state.activeChatId, msgId);
        if (found) {
            // Wait a bit for render
            await new Promise(resolve => setTimeout(resolve, 300));
            msgEl = document.getElementById(`msg-wrapper-${msgId}`);
            innerMsgEl = document.getElementById(`msg-${msgId}`);
        }
    }

    if (msgEl && innerMsgEl) {
        msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        innerMsgEl.classList.remove('jump-highlight');
        innerMsgEl.classList.remove('!ring-4', '!ring-blue-500', '!bg-blue-500/40', '!scale-[1.02]', 'transition-all', 'duration-300', 'duration-1000');
        
        // Force reflow
        void innerMsgEl.offsetWidth;
        
        innerMsgEl.classList.add('!ring-4', '!ring-blue-500', '!bg-blue-500/40', '!scale-[1.02]', 'transition-all', 'duration-300');
        setTimeout(() => {
            innerMsgEl?.classList.replace('duration-300', 'duration-1000');
            innerMsgEl?.classList.remove('!ring-4', '!ring-blue-500', '!bg-blue-500/40', '!scale-[1.02]');
        }, 1500);
    } else {
        customToast('Сообщение слишком далеко в истории.');
    }
}

export async function uploadGroupAvatar(e: any) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const { uploadToCloudinary } = await import('./utils');
        const url = await uploadToCloudinary(file, true);
        await supabase.from('chats').update({ avatar_url: url }).eq('id', state.activeChatId);
        
        // Update main UI
        const avatar = document.getElementById('chat-header-avatar')!;
        avatar.innerHTML = `<img src="${url}" class="w-full h-full object-cover rounded-full">`;
        avatar.className = `w-10 h-10 mr-3 shadow-sm relative rounded-full`;
        
        openChatInfo(); // Refresh modal
        loadChats();
    } catch(err) {
        console.error(err);
        customAlert('Ошибка загрузки аватара');
    }
}

export async function generateInviteKey() {
    const key = 'vibe_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    await supabase.from('chats').update({ invite_key: key }).eq('id', state.activeChatId);
    navigator.clipboard.writeText(key);
    customToast('Ключ скопирован: ' + key);
}

export async function saveGroupSettings() {
    const desc = (document.getElementById('group-description-input') as HTMLTextAreaElement).value.trim();
    const isPublicToggle = document.getElementById('channel-public-toggle') as HTMLInputElement;
    const isPublic = isPublicToggle ? isPublicToggle.checked : false;
    
    await supabase.from('chats').update({ description: desc, is_public: isPublic }).eq('id', state.activeChatId);
    state.activeChatDescription = desc;
    state.activeChatIsPublic = isPublic;
    loadChats();
}

export async function toggleBlockUser(userId: string) {
    const { data: profile } = await supabase.from('profiles').select('settings').eq('id', state.currentUser!.id).single();
    const settings = profile?.settings || {};
    const blocked_users = settings.blocked_users || [];
    
    if (blocked_users.includes(userId)) {
        settings.blocked_users = blocked_users.filter((id: string) => id !== userId);
    } else {
        settings.blocked_users = [...blocked_users, userId];
    }
    await supabase.from('profiles').update({ settings }).eq('id', state.currentUser!.id);
    state.currentProfile.settings = settings;
    
    openChatInfo();
    import('./chat').then(m => m.loadChats());
}
(window as any).toggleBlockUser = toggleBlockUser;

export async function approveJoinRequest(userId: string) {
    await supabase.from('chat_members').update({ role: 'member' }).eq('chat_id', state.activeChatId).eq('user_id', userId);
    openChatInfo();
}

export async function rejectJoinRequest(userId: string) {
    await supabase.from('chat_members').delete().eq('chat_id', state.activeChatId).eq('user_id', userId);
    openChatInfo();
}

export async function promoteToAdmin(userId: string) {
    await supabase.from('chat_members').update({ role: 'admin' }).eq('chat_id', state.activeChatId).eq('user_id', userId);
    openChatInfo(); // Refresh modal
}

export async function demoteAdmin(userId: string) {
    await supabase.from('chat_members').update({ role: 'member' }).eq('chat_id', state.activeChatId).eq('user_id', userId);
    openChatInfo(); // Refresh modal
}

export async function kickMember(userId: string) {
    const confirmed = await customConfirm('Удалить этого пользователя из группы?');
    if (!confirmed) return;
    await supabase.from('chat_members').delete().eq('chat_id', state.activeChatId).eq('user_id', userId);
    
    const { count } = await supabase.from('chat_members').select('*', { count: 'exact', head: true }).eq('chat_id', state.activeChatId);
    if (count === 0) {
        await supabase.from('chats').delete().eq('id', state.activeChatId);
        closeModal();
        state.activeChatId = null;
        document.getElementById('chat-area')!.classList.add('hidden');
        document.getElementById('chat-area')!.classList.remove('flex');
        document.getElementById('sidebar')!.classList.remove('hidden');
        if ((window as any).logic?.loadChats) (window as any).logic.loadChats();
        return;
    }
    openChatInfo(); // Refresh modal
}

export async function toggleMuteChat() {
    if (!state.activeChatId) return;
    const { data: profile } = await supabase.from('profiles').select('settings').eq('id', state.currentUser.id).single();
    const settings = profile?.settings || {};
    const mutedChats = settings.muted_chats || [];
    
    if (mutedChats.includes(state.activeChatId)) {
        settings.muted_chats = mutedChats.filter((id: string) => id !== state.activeChatId);
    } else {
        settings.muted_chats = [...mutedChats, state.activeChatId];
    }
    
    await supabase.from('profiles').update({ settings }).eq('id', state.currentUser.id);
    openChatInfo();
}

export function openAddMemberModal() {
    state.groupCreationSelectedUsers = [];
    const modal = document.getElementById('modal-content')!;
    modal.innerHTML = `
        <div class="p-6">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Добавить участников</h3>
                <button onclick="openChatInfo()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                </button>
            </div>
            
            <div class="space-y-4 mb-6 relative">
                <div class="relative">
                    <div class="relative mt-1">
                        <input type="text" id="add-member-search" placeholder="Поиск людей..." class="w-full p-3.5 pl-10 bg-gray-50 dark:bg-gray-800 border-b-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-700 rounded-t-xl outline-none transition-all font-medium text-gray-800 dark:text-gray-100" oninput="searchUsersForAdding(this.value)">
                        <svg class="w-5 h-5 absolute left-3.5 top-3.5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                    <div id="add-member-search-results" class="hidden absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl max-h-48 overflow-y-auto z-30"></div>
                </div>
                
                <div id="add-member-selected-users" class="flex flex-wrap gap-2 min-h-[48px] p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 empty:hidden"></div>
            </div>
            
            <button onclick="addSelectedMembers()" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl transition-colors shadow-md">
                Добавить
            </button>
        </div>
    `;
}

export async function searchUsersForAdding(query: string) {
    const resultsContainer = document.getElementById('add-member-search-results')!;
    if (!query.trim()) {
        resultsContainer.classList.add('hidden');
        return;
    }

    // Get current members to exclude them
    const { data: currentMembers } = await supabase.from('chat_members').select('user_id').eq('chat_id', state.activeChatId);
    const currentMemberIds = currentMembers?.map(m => m.user_id) || [];

    const { data, error } = await supabase.from('profiles')
        .select('id, username, display_name, avatar_url, settings, is_premium, premium_until')
        .ilike('username', `%${query}%`)
        .neq('id', state.currentUser!.id)
        .limit(30);

    if (error || !data || data.length === 0) {
        resultsContainer.innerHTML = '<div class="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">Ничего не найдено</div>';
        resultsContainer.classList.remove('hidden');
        return;
    }

    // Filter out existing members, already selected users, and tech support users
    const filteredData = data.filter(u => !(u.settings && u.settings.is_tech_support) && !currentMemberIds.includes(u.id) && !state.groupCreationSelectedUsers.find(su => su.id === u.id)).slice(0, 10);

    if (filteredData.length === 0) {
        resultsContainer.innerHTML = '<div class="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">Все найденные пользователи уже в группе</div>';
        resultsContainer.classList.remove('hidden');
        return;
    }

    resultsContainer.innerHTML = filteredData.map(u => {
        const isPremiumUser = u.is_premium && (!u.premium_until || new Date(u.premium_until) > new Date());
        const premiumBadgeHtml = isPremiumUser ? `<div class="absolute -top-1 -left-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm border border-gray-200 dark:border-gray-700 z-50 w-3 h-3 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : '';
        return `
        <div class="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors border-b border-gray-50 dark:border-gray-700 last:border-0" onclick="selectUserForAdding('${u.id}', '${u.display_name || u.username}')">
            <div class="relative w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-500 dark:text-blue-400 font-bold shrink-0">
                <div class="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-blue-100 dark:bg-blue-900/50">
                    ${u.avatar_url ? `<img src="${u.avatar_url}" class="w-full h-full object-cover">` : (u.display_name || u.username)[0].toUpperCase()}
                </div>
                ${premiumBadgeHtml}
            </div>
            <div class="min-w-0">
                <div class="font-semibold text-gray-800 dark:text-gray-100 truncate">${u.display_name || u.username}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400 truncate">@${u.username}</div>
            </div>
        </div>
        `;
    }).join('');
    resultsContainer.classList.remove('hidden');
}

export function selectUserForAdding(id: string, name: string) {
    if (!state.groupCreationSelectedUsers.find(u => u.id === id)) {
        state.groupCreationSelectedUsers.push({ id, name });
        renderAddMemberSelectedUsers();
    }
    document.getElementById('add-member-search-results')!.classList.add('hidden');
    (document.getElementById('add-member-search') as HTMLInputElement).value = '';
}

export function removeUserFromAdding(id: string) {
    state.groupCreationSelectedUsers = state.groupCreationSelectedUsers.filter(u => u.id !== id);
    renderAddMemberSelectedUsers();
}

export function renderAddMemberSelectedUsers() {
    const container = document.getElementById('add-member-selected-users')!;
    container.innerHTML = state.groupCreationSelectedUsers.map(u => `
        <div class="flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg text-sm font-medium max-w-full">
            <span class="truncate">${u.name}</span>
            <button onclick="removeUserFromAdding('${u.id}')" class="hover:text-blue-900 dark:hover:text-blue-100 ml-1 transition-colors shrink-0">×</button>
        </div>
    `).join('');
}

export async function addSelectedMembers() {
    if (state.groupCreationSelectedUsers.length === 0) return;
    
    const membersToInsert = state.groupCreationSelectedUsers.map(u => ({
        chat_id: state.activeChatId,
        user_id: u.id,
        role: 'member'
    }));

    const { error } = await supabase.from('chat_members').insert(membersToInsert);
    
    if (!error) {
        openChatInfo(); // Go back to chat info
    } else {
        customAlert("Ошибка при добавлении участников");
    }
}

export function openCreateGroup(skipPushState = false) {
    if (state.currentProfile?.settings?.is_tech_support) {
        import('./utils').then(m => m.customAlert("Техническая поддержка не может создавать группы."));
        return;
    }

    if (!skipPushState && window.location.hash !== '#create') {
        window.history.pushState({ screen: 'create' }, '', '#create');
    }

    state.groupCreationSelectedUsers = [];
    (window as any).tempGroupName = '';
    (window as any).tempGroupUsername = '';
    renderCreateGroupModal('group');
    document.getElementById('modal-overlay')!.classList.remove('hidden');
}

export function openCreateChannel(skipPushState = false) {
    if (state.currentProfile?.settings?.is_tech_support) {
        import('./utils').then(m => m.customAlert("Техническая поддержка не может создавать каналы."));
        return;
    }

    if (!skipPushState && window.location.hash !== '#create') {
        window.history.pushState({ screen: 'create' }, '', '#create');
    }

    state.groupCreationSelectedUsers = [];
    (window as any).tempGroupName = '';
    (window as any).tempGroupUsername = '';
    renderCreateGroupModal('channel');
    document.getElementById('modal-overlay')!.classList.remove('hidden');
}

export function renderCreateGroupModal(type: 'group' | 'channel' = 'group') {
    const currentNameInput = document.getElementById('group-name') as HTMLInputElement;
    if (currentNameInput) {
        (window as any).tempGroupName = currentNameInput.value;
    }
    const currentUsernameInput = document.getElementById('group-username') as HTMLInputElement;
    if (currentUsernameInput) {
        (window as any).tempGroupUsername = currentUsernameInput.value;
    }
    
    const isChannel = type === 'channel';
    const modal = document.getElementById('modal-content')!;
    modal.innerHTML = `
        <div class="p-6">
            <div class="flex justify-between items-center mb-6">
                <div class="flex items-center gap-3">
                    <button onclick="import('./utils').then(m => m.closeModal(undefined, true)); setTimeout(() => { window.location.hash = '#settings'; window.openSettings('full', true); }, 50);" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button>
                    <h3 class="text-2xl font-bold text-gray-800 dark:text-gray-100">${isChannel ? 'Новый канал' : 'Новая группа'}</h3>
                </div>
                    <button onclick="window.closeModal(undefined, true); window.location.hash = '';" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors">✕</button>
            </div>
            
            <div class="space-y-4 mb-6 relative">
                <div>
                    <label class="text-[11px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider ml-1">Название</label>
                    <input type="text" id="group-name" placeholder="Введите название..." value="${(window as any).tempGroupName || ''}" oninput="window.tempGroupName = this.value" class="w-full mt-1 p-3.5 bg-gray-50 dark:bg-gray-800 border-b-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-700 rounded-t-xl outline-none transition-all font-medium text-gray-800 dark:text-gray-100">
                </div>
                
                <div>
                    <label class="text-[11px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider ml-1">Уникальный ID</label>
                    <div class="relative mt-1">
                        <span class="absolute left-3.5 top-3.5 text-gray-400 font-medium select-none">@</span>
                        <input type="text" id="group-username" placeholder="Например: my_cool_${isChannel ? 'channel' : 'group'}" value="${(window as any).tempGroupUsername || ''}" oninput="this.value = this.value.replace(/[^a-zA-Z0-9_]/g, ''); window.tempGroupUsername = this.value" class="w-full p-3.5 pl-8 bg-gray-50 dark:bg-gray-800 border-b-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-700 rounded-t-xl outline-none transition-all font-medium text-gray-800 dark:text-gray-100">
                    </div>
                </div>
                
                <div class="mt-4 mb-4 flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div>
                        <div class="font-semibold text-sm text-gray-800 dark:text-gray-100">${isChannel ? 'Публичный канал' : 'Публичная группа'}</div>
                        <div class="text-xs text-gray-500 mt-0.5">Любой пользователь сможет найти ${isChannel ? 'канал' : 'группу'} в поиске</div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="chat-is-public" class="sr-only peer">
                      <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
                    </label>
                </div>
                
                ${isChannel ? '' : `
                <div class="relative">
                    <label class="text-[11px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider ml-1">Участники</label>
                    <div class="relative mt-1">
                        <input type="text" id="group-search" placeholder="Поиск людей..." class="w-full p-3.5 pl-10 bg-gray-50 dark:bg-gray-800 border-b-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-700 rounded-t-xl outline-none transition-all font-medium text-gray-800 dark:text-gray-100" oninput="searchGroupUsers(this.value, '${type}')">
                        <svg class="w-5 h-5 absolute left-3.5 top-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                    <div id="group-search-results" class="hidden absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl max-h-48 overflow-y-auto z-30"></div>
                </div>
                
                <div id="selected-users-list" class="flex flex-wrap gap-2 min-h-[48px] p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 empty:hidden"></div>
                `}
            </div>
            
            <button onclick="${isChannel ? 'createChannel()' : 'createGroup()'}" class="w-full bg-blue-500 hover:bg-blue-600 transition-colors text-white font-bold py-3.5 rounded-xl shadow-sm">Создать ${isChannel ? 'канал' : 'группу'}</button>
        </div>
    `;
    
    const list = document.getElementById('selected-users-list');
    if (list) {
        if (state.groupCreationSelectedUsers.length > 0) {
            state.groupCreationSelectedUsers.forEach(u => {
                const isPremiumUser = u.is_premium && (!u.premium_until || new Date(u.premium_until) > new Date());
                const premiumBadgeHtml = isPremiumUser ? `<div class="absolute -top-0.5 -left-0.5 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm border border-gray-200 dark:border-gray-700 z-50 w-2.5 h-2.5 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : '';
                list.innerHTML += `
                    <div class="bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 border border-blue-100 dark:border-blue-900/30 shadow-sm animate-fadeIn max-w-full">
                        <div class="relative w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] shrink-0">
                            <div class="w-full h-full overflow-hidden rounded-full flex items-center justify-center bg-blue-100">
                                ${u.avatar_url ? `<img src="${u.avatar_url}" class="w-full h-full object-cover">` : (u.display_name || u.username)[0].toUpperCase()}
                            </div>
                            ${premiumBadgeHtml}
                        </div>
                        <span class="truncate">${u.display_name || u.username}</span>
                        <button class="text-gray-400 hover:text-red-500 ml-1 transition-colors shrink-0" onclick="removeGroupUser('${u.id}', '${type}')">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>`;
            });
        } else {
            list.classList.add('hidden');
        }
    }
}

let gSearchTimeout: any;
export async function searchGroupUsers(q: string, type: 'group' | 'channel' = 'group') {
    clearTimeout(gSearchTimeout);
    const resultsBox = document.getElementById('group-search-results')!;
    if (q.trim().length < 2) { resultsBox.classList.add('hidden'); return; }
    
    gSearchTimeout = setTimeout(async () => {
        const { data: rawData } = await supabase.from('profiles').select('*').ilike('display_name', `%${q}%`).neq('id', state.currentUser.id).limit(30);
        const data = rawData?.filter((u: any) => !(u.settings && u.settings.is_tech_support))?.slice(0, 5);
        resultsBox.innerHTML = '';
        
        if(data && data.length > 0) {
            data.forEach(u => {
                const isPremiumUser = u.is_premium && (!u.premium_until || new Date(u.premium_until) > new Date());
                const premiumBadgeHtml = isPremiumUser ? `<div class="absolute -top-1 -left-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm border border-gray-200 dark:border-gray-700 z-50 w-3 h-3 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : '';
                if(state.groupCreationSelectedUsers.find(su => su.id === u.id)) return;
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-50 dark:border-gray-700 flex items-center gap-3 transition-colors min-w-0';
                div.innerHTML = `
                    <div class="relative w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-500 dark:text-blue-400 font-bold text-xs shrink-0">
                        <div class="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-blue-100 dark:bg-blue-900/50">
                            ${u.avatar_url ? `<img src="${u.avatar_url}" class="w-full h-full object-cover">` : (u.display_name || u.username)[0].toUpperCase()}
                        </div>
                        ${premiumBadgeHtml}
                    </div>
                    <span class="font-semibold text-gray-800 dark:text-gray-100 truncate block">${u.display_name || u.username}</span>
                `;
                div.onclick = () => { 
                    state.groupCreationSelectedUsers.push(u); 
                    renderCreateGroupModal(type); 
                    setTimeout(() => document.getElementById('group-search')?.focus(), 10);
                };
                resultsBox.appendChild(div);
            });
            if (resultsBox.children.length > 0) resultsBox.classList.remove('hidden');
            else resultsBox.classList.add('hidden');
        } else {
            resultsBox.innerHTML = '<div class="p-4 text-center text-gray-500 text-sm">Ничего не найдено</div>';
            resultsBox.classList.remove('hidden');
        }
    }, 300);
}

export function removeGroupUser(id: string, type: 'group' | 'channel' = 'group') { state.groupCreationSelectedUsers = state.groupCreationSelectedUsers.filter(u => u.id !== id); renderCreateGroupModal(type); }

export async function createGroup() {
    const name = (document.getElementById('group-name') as HTMLInputElement).value.trim();
    if(!name) return customAlert('Введите название группы');
    if(name.length < 3 || name.length > 35) return customAlert('Название должно быть от 3 до 35 символов');
    
    const username = (document.getElementById('group-username') as HTMLInputElement).value.trim();
    if(!username || username.length < 3) return customAlert('Введите корректный ID (от 3 символов)');
    
    // Check if ID is taken
    const { data: existingChat } = await supabase.from('chats').select('id').eq('username', username).single();
    if (existingChat) return customAlert('Данный ID уже занят');

    const isPublic = (document.getElementById('chat-is-public') as HTMLInputElement)?.checked || false;
    const newChatId = crypto.randomUUID();
    await supabase.from('chats').insert({ id: newChatId, type: 'group', title: name, is_public: isPublic, username: username });
    const members = [{ chat_id: newChatId, user_id: state.currentUser.id, role: 'creator' }];
    state.groupCreationSelectedUsers.forEach(u => members.push({ chat_id: newChatId, user_id: u.id, role: 'member' }));
    await supabase.from('chat_members').insert(members);
    
    window.history.replaceState({ screen: 'chat', chatId: newChatId }, '', '#chat');
    import('./utils').then(m => m.closeModal(undefined, true));
    await loadChats();
    openChat(newChatId, name, name[0].toUpperCase(), true, 'group', members.map(m=>({user_id: m.user_id, role: m.role})), undefined, undefined, isPublic, true);
}

export async function createChannel() {
    const name = (document.getElementById('group-name') as HTMLInputElement).value.trim();
    if(!name) return customAlert('Введите название канала');
    if(name.length < 3 || name.length > 35) return customAlert('Название должно быть от 3 до 35 символов');

    const username = (document.getElementById('group-username') as HTMLInputElement).value.trim();
    if(!username || username.length < 3) return customAlert('Введите корректный ID (от 3 символов)');
    
    // Check if ID is taken
    const { data: existingChat } = await supabase.from('chats').select('id').eq('username', username).single();
    if (existingChat) return customAlert('Данный ID уже занят');
    
    const isPublic = (document.getElementById('chat-is-public') as HTMLInputElement)?.checked || false;
    const newChatId = crypto.randomUUID();
    await supabase.from('chats').insert({ id: newChatId, type: 'channel', title: name, is_public: isPublic, username: username });
    const members = [{ chat_id: newChatId, user_id: state.currentUser.id, role: 'creator' }];
    state.groupCreationSelectedUsers.forEach(u => members.push({ chat_id: newChatId, user_id: u.id, role: 'member' }));
    await supabase.from('chat_members').insert(members);
    
    window.history.replaceState({ screen: 'chat', chatId: newChatId }, '', '#chat');
    import('./utils').then(m => m.closeModal(undefined, true));
    await loadChats();
    openChat(newChatId, name, name[0].toUpperCase(), true, 'channel', members.map(m=>({user_id: m.user_id, role: m.role})), undefined, undefined, isPublic, true);
}

export async function leaveGroup() {
    const { data: myMember } = await supabase.from('chat_members').select('role').eq('chat_id', state.activeChatId).eq('user_id', state.currentUser.id).single();
    
    if (myMember?.role === 'creator') {
        const confirmed = await customConfirm('Вы создатель группы. Если вы покинете её, группа будет удалена для всех участников. Продолжить?');
        if (!confirmed) return;
        
        await supabase.from('chats').delete().eq('id', state.activeChatId);
        closeModal();
        
        state.activeChatId = null;
        document.getElementById('chat-area')!.classList.add('hidden');
        document.getElementById('chat-area')!.classList.remove('flex');
        document.getElementById('sidebar')!.classList.remove('hidden');
        
        loadChats();
        return;
    }
    
    const confirmed = await customConfirm('Вы уверены, что хотите покинуть группу?');
    if (!confirmed) return;
    
    await supabase.from('chat_members').delete().eq('chat_id', state.activeChatId).eq('user_id', state.currentUser.id);
    
    const { count } = await supabase.from('chat_members').select('*', { count: 'exact', head: true }).eq('chat_id', state.activeChatId);
    if (count === 0) {
        await supabase.from('chats').delete().eq('id', state.activeChatId);
    }
    
    closeModal();
    
    // Switch to no chat
    state.activeChatId = null;
    document.getElementById('chat-area')!.classList.add('hidden');
    document.getElementById('chat-area')!.classList.remove('flex');
    document.getElementById('sidebar')!.classList.remove('hidden');
    
    loadChats();
}

export async function clearHistory() {
    const confirmed = await customConfirm('Вы уверены, что хотите очистить историю сообщений? Это действие нельзя отменить.');
    if (!confirmed) return;
    
    await supabase.from('messages').delete().eq('chat_id', state.activeChatId);
    closeModal();
    import('./messages').then(m => m.loadMessages(state.activeChatId!));
}

export async function deleteChat() {
    const confirmed = await customConfirm('Вы уверены, что хотите удалить этот чат?');
    if (!confirmed) return;
    
    await supabase.from('chats').delete().eq('id', state.activeChatId);
    closeModal();
    
    // Switch to no chat
    state.activeChatId = null;
    document.getElementById('chat-area')!.classList.add('hidden');
    document.getElementById('chat-area')!.classList.remove('flex');
    document.getElementById('sidebar')!.classList.remove('hidden');
    
    loadChats();
}

export async function toggleSavedMessagesVisibility(isChecked: boolean) {
    const profile = state.currentProfile;
    if (!profile) return;
    const settings = profile.settings || {};
    settings.show_saved_messages = isChecked;
    profile.settings = settings;

    await supabase.from('profiles').update({ settings }).eq('id', state.currentUser.id);
    import('./chat').then(m => m.loadChats());
}
(window as any).toggleSavedMessagesVisibility = toggleSavedMessagesVisibility;

export async function checkGlobalPendingRequests() {
    if (!state.currentUser) return;
    
    const { data: myAdminGroups } = await supabase.from('chat_members').select('chat_id').eq('user_id', state.currentUser.id).in('role', ['creator', 'admin']);
    if (!myAdminGroups || myAdminGroups.length === 0) return;
    
    const adminChatIds = myAdminGroups.map(g => g.chat_id);
    const { data: pendingMembers } = await supabase.from('chat_members').select('*, profiles(*), chats(title)').in('chat_id', adminChatIds).eq('role', 'pending');
    
    if (pendingMembers && pendingMembers.length > 0) {
        showGlobalPendingModal(pendingMembers);
    } else {
        const modal = document.getElementById('global-pending-modal');
        if (modal) modal.remove();
    }
}

export function showGlobalPendingModal(pendingMembers: any[]) {
    let modal = document.getElementById('global-pending-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'global-pending-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
        document.body.appendChild(modal);
    }
    
    if (pendingMembers.length === 0) {
        modal.remove();
        return;
    }
    
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div class="p-6 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900 z-10 relative">
                <h3 class="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                    <svg class="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-8m0 0H4m4 0h8m-4-6v6"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Новые заявки
                </h3>
                <p class="text-[13px] font-medium text-gray-500 mt-2">Рассмотрите входящие запросы на добавление в ваши группы.</p>
            </div>
            <div class="p-4 overflow-y-auto flex-1 bg-gray-50/50 dark:bg-gray-800/20 space-y-3 relative">
                ${pendingMembers.map((m: any) => `
                    <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div class="text-[11px] font-bold text-orange-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg> ${m.chats?.title || 'Группа'}</div>
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-lg shrink-0 uppercase shadow-sm">
                                ${m.profiles?.avatar_url ? `<img src="${m.profiles.avatar_url}" class="w-full h-full object-cover rounded-full">` : (m.profiles?.display_name || m.profiles?.username || 'U')[0]}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="font-bold text-gray-900 dark:text-white text-base truncate">${m.profiles?.display_name || m.profiles?.username}</div>
                                <div class="text-xs font-medium text-gray-400 truncate mt-0.5">@${m.profiles?.username}</div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 mt-5">
                            <button onclick="handleGlobalJoinRequest('${m.user_id}', '${m.chat_id}', 'accept')" class="flex-1 py-2.5 bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-xl font-bold text-sm tracking-wide hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors border border-green-200 dark:border-transparent active:scale-95 duration-150">
                                Принять
                            </button>
                            <button onclick="handleGlobalJoinRequest('${m.user_id}', '${m.chat_id}', 'reject')" class="flex-1 py-2.5 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-xl font-bold text-sm tracking-wide hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors border border-red-200 dark:border-transparent active:scale-95 duration-150">
                                Отклонить
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            ${pendingMembers.length > 5 ? '<div class="p-3 bg-white dark:bg-gray-900 text-center text-xs font-medium text-gray-400 border-t border-gray-50 dark:border-gray-800">Прокрутите вниз, чтобы увидеть все</div>' : ''}
        </div>
    `;
}

(window as any).handleGlobalJoinRequest = async (userId: string, chatId: string, action: 'accept' | 'reject') => {
    if (action === 'accept') {
        await supabase.from('chat_members').update({ role: 'member' }).eq('chat_id', chatId).eq('user_id', userId);
    } else {
        await supabase.from('chat_members').delete().eq('chat_id', chatId).eq('user_id', userId);
    }
    
    checkGlobalPendingRequests();
    if (state.activeChatId === chatId) {
        import('./group').then(m => m.openChatInfo());
    }
};
(window as any).checkGlobalPendingRequests = checkGlobalPendingRequests;
