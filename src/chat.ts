import { supabase, state } from './supabase';
import { getStatusText, customConfirm } from './utils';
import { loadMessages, markMessagesAsRead } from './messages';

export async function loadChats() {
    try {
        import('./group').then(m => {
            if (m.checkGlobalPendingRequests) m.checkGlobalPendingRequests();
        }).catch(err => console.error("Error loading group for pending checks:", err));
        
        const { data: members, error: membersError } = await supabase.from('chat_members').select('chat_id').eq('user_id', state.currentUser.id);
        if (membersError) throw membersError;
        
        let chatIds = members ? members.map(m => m.chat_id) : [];
        if (state.currentProfile?.settings?.is_tech_support) {
            const { data: supportChats } = await supabase.from('chats').select('id').eq('description', 'TECH_SUPPORT_CHAT');
            if (supportChats) {
                chatIds = [...new Set([...chatIds, ...supportChats.map(c => c.id)])];
            }
        }
        
        const list = document.getElementById('chats-list')!;
        
        if (chatIds.length === 0) {
            list.innerHTML = `<div class="text-center text-gray-400 mt-20 p-6"><span class="text-sm">У вас пока нет чатов.<br>Найдите друзей через поиск выше.</span></div>`;
            return;
        }
        
        const { data: chats, error: chatsError } = await supabase.from('chats').select(`id, created_at, type, title, avatar_url, description, is_public, chat_members(user_id, role, profiles(id, username, display_name, last_seen, is_online, avatar_url, bio, settings, is_premium, premium_until)), messages(content, message_type, created_at, is_read, sender_id)`).in('id', chatIds);
        if (chatsError) throw chatsError;
        if (!chats) return;

        chats.forEach((chat: any) => {
            if (chat.messages) {
                chat.messages.sort((m1: any, m2: any) => new Date(m1.created_at).getTime() - new Date(m2.created_at).getTime());
            }
        });

        chats.sort((a: any, b: any) => {
            const dA = a.messages?.length ? new Date(a.messages[a.messages.length-1].created_at).getTime() : new Date(a.created_at || 0).getTime();
            const dB = b.messages?.length ? new Date(b.messages[b.messages.length-1].created_at).getTime() : new Date(b.created_at || 0).getTime();
            if (dB === dA) return a.id.localeCompare(b.id);
            return (dB || 0) - (dA || 0);
        });

        // Find Saved Messages
        let savedMessagesIdx = chats.findIndex((c: any) => !c.type.includes('group') && !c.type.includes('channel') && (!c.chat_members || c.chat_members.filter((m: any) => m.user_id !== state.currentUser.id).length === 0));
        let savedMessagesChat = null;
        if (savedMessagesIdx !== -1) {
            savedMessagesChat = chats.splice(savedMessagesIdx, 1)[0];
        }

        const showSavedMessages = state.currentProfile?.settings?.show_saved_messages !== false;

        if (showSavedMessages) {
            if (!savedMessagesChat) {
                // Mock one
                savedMessagesChat = {
                    id: 'new_saved_messages', // We'll handle this in onclick
                    created_at: new Date().toISOString(),
                    type: 'private',
                    title: 'Избранное',
                    avatar_url: null,
                    description: '',
                    is_public: false,
                    chat_members: [{ user_id: state.currentUser.id, role: 'admin', profiles: state.currentProfile }],
                    messages: []
                };
            }
            chats.unshift(savedMessagesChat);
        }

        list.innerHTML = '';
        chats.forEach((chat: any) => {
            let isGroup = chat.type === 'group' || chat.type === 'channel';
            
            // Skip empty direct chats (ghost chats) unless it's currently active or it's saved messages
            if ((chat.type === 'direct' || chat.type === 'private') && (!chat.messages || chat.messages.length === 0) && chat.id !== state.activeChatId && chat.id !== 'new_saved_messages') {
                return;
            }

            let chatName = chat.title;
            let isOnline = false;
            let isSavedMessages = false;

            if (chat.description === 'TECH_SUPPORT_CHAT' && !state.currentProfile?.settings?.is_tech_support) {
                chatName = 'Служба поддержки';
                isGroup = false; 
            } else if (!isGroup) {
                const others = chat.chat_members?.filter((m: any) => m.user_id !== state.currentUser.id);
                if (!others || others.length === 0) {
                    isSavedMessages = true;
                    chatName = 'Избранное';
                } else {
                    const other = others[0];
                    if(other?.profiles) {
                        chatName = other.profiles.display_name || other.profiles.username;
                        const isTechSupport = other.profiles.settings?.is_tech_support === true;
                        if (isTechSupport) {
                            isOnline = false;
                        } else {
                            isOnline = other.profiles.is_online;
                            if (isOnline && other.profiles.last_seen) {
                                if (new Date().getTime() - new Date(other.profiles.last_seen).getTime() > 3 * 60 * 1000) {
                                    isOnline = false;
                                }
                            }
                        }
                    }
                }
            }

            const lastMsg = chat.messages?.length ? chat.messages[chat.messages.length - 1] : null;
            let previewText = '<span class="italic text-gray-400">Нет сообщений</span>';
            
            if (lastMsg) {
                if (lastMsg.message_type === 'voice') previewText = '🎤 Голосовое';
                else if (lastMsg.message_type === 'video_circle') previewText = '📹 Видеосообщение';
                else if (lastMsg.message_type === 'photo') previewText = '📷 Фото';
                else if (lastMsg.message_type === 'video') previewText = '🎥 Видео';
                else if (lastMsg.message_type === 'document') previewText = '📁 Файл';
                else previewText = lastMsg.content || '';
                
                if (lastMsg.sender_id === state.currentUser.id) {
                    previewText = `${lastMsg.is_read ? '✓✓' : '✓'} <span class="text-gray-600 truncate">${previewText}</span>`;
                } else {
                    previewText = `<span class="truncate">${previewText}</span>`;
                }
            }

            const firstLetter = (chatName || 'C')[0].toUpperCase();
            
            let avatarUrl = null;
            if (isSavedMessages) {
                // saved messages
            } else if (!isGroup) {
                if (chat.description === 'TECH_SUPPORT_CHAT' && !state.currentProfile?.settings?.is_tech_support) {
                    avatarUrl = null;
                } else {
                    const other = chat.chat_members?.find((m: any) => m.user_id !== state.currentUser.id);
                    if(other?.profiles) avatarUrl = other.profiles.avatar_url;
                }
            } else {
                avatarUrl = chat.avatar_url;
            }

            const div = document.createElement('div');
            div.className = `p-3.5 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex items-center gap-3.5 ${state.activeChatId === chat.id ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`;
            div.dataset.chatId = chat.id;
            div.onclick = () => {
                if (chat.id === 'new_saved_messages') {
                    import('./search').then(m => m.startChatWithUser(state.currentProfile));
                    return;
                }
                if (state.isAdminStatus) {
                    state.isAdminStatus = false;
                    localStorage.removeItem('incognito_chat_args');
                    const adminBanner = document.getElementById('admin-incognito-banner');
                    if (adminBanner) adminBanner.classList.add('hidden');
                }
                
                document.querySelectorAll('#chats-list > div').forEach(el => {
                    if ((el as HTMLElement).dataset.chatId === chat.id) {
                        el.classList.add('bg-blue-50', 'dark:bg-blue-900/40');
                    } else {
                        el.classList.remove('bg-blue-50', 'dark:bg-blue-900/40', 'bg-blue-50/60', 'dark:bg-blue-900/30');
                    }
                });

                openChat(chat.id, chatName || 'Чат', firstLetter, isGroup, chat.type, chat.chat_members, avatarUrl, chat.description, chat.is_public);
            };
            
            let avatarHtml;
            if (isSavedMessages) {
                avatarHtml = `<div class="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">И</div>`;
            } else {
                avatarHtml = avatarUrl 
                    ? `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full">` 
                    : `<div class="w-full h-full bg-gradient-to-br ${isGroup ? 'from-emerald-400 to-teal-500' : 'from-blue-400 to-indigo-500'} rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">${firstLetter}</div>`;
            }

            const unreadCount = chat.messages ? chat.messages.filter((m: any) => !m.is_read && m.sender_id !== state.currentUser.id).length : 0;
            const unreadBadge = unreadCount > 0 ? `<div class="bg-blue-500 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ml-2 shrink-0">${unreadCount}</div>` : '';

            const isMuted = (state.currentUser?.settings?.muted_chats || []).includes(chat.id);
            const muteBadge = isMuted ? `<svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h2.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z m7.414-2l4 4m0-4l-4 4m8-8l-4 4m0-4l4 4"></path></svg>` : '';

            const otherUserProfile = !isGroup ? chat.chat_members?.find((m: any) => m.user_id !== state.currentUser.id)?.profiles : null;
            const isPremiumUser = otherUserProfile?.is_premium && (!otherUserProfile.premium_until || new Date(otherUserProfile.premium_until) > new Date());
            const premiumBadgeListHtml = isPremiumUser ? `<span class="inline-flex items-center justify-center ml-1 shrink-0" title="Vibegram Premium"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-3.5 h-3.5 object-contain" alt="Premium"></span>` : '';

            div.innerHTML = `
                <div class="relative shrink-0 w-12 h-12 pointer-events-none">
                    <div class="w-full h-full rounded-full overflow-hidden relative">
                        ${avatarHtml}
                    </div>
                    ${isOnline && !isGroup ? '<div class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full z-10"></div>' : ''}
                </div>
                <div class="flex-1 min-w-0 overflow-hidden flex flex-col justify-center pointer-events-none">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1 min-w-0 flex-1">
                            <div class="font-bold text-gray-900 dark:text-gray-100 text-[15px] flex items-center min-w-0 flex-1 max-w-full">
                                <div class="truncate shrink">${chatName || 'Неизвестно'}</div>
                                ${premiumBadgeListHtml}
                            </div>
                            ${muteBadge}
                        </div>
                        ${unreadBadge}
                    </div>
                    <div class="text-[14px] text-gray-500 dark:text-gray-400 truncate mt-0.5 flex items-center justify-between">${previewText}</div>
                </div>
            `;
            list.appendChild(div);

            // Context Menu Setup
            let touchTimer: any;
            div.addEventListener('touchstart', (e) => {
                touchTimer = setTimeout(() => {
                    openChatContextMenu(chat.id, chatName || 'Чат', e);
                }, 600);
            }, {passive: true});
            div.addEventListener('touchend', () => clearTimeout(touchTimer));
            div.addEventListener('touchmove', () => clearTimeout(touchTimer));
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openChatContextMenu(chat.id, chatName || 'Чат', e);
            });
        });
    } catch (error: any) {
        console.error('Error loading chats:', error.message || error);
        const list = document.getElementById('chats-list')!;
        if (error?.message === 'Failed to fetch' || error?.message?.includes('Failed to fetch')) {
            list.innerHTML = `<div class="text-center text-red-500 mt-20 p-6"><span class="text-sm">Нет соединения с базой данных (Failed to fetch).<br>Возможно, проект Supabase приостановлен.</span></div>`;
        } else {
            list.innerHTML = `<div class="text-center text-red-400 mt-20 p-6"><span class="text-sm">Ошибка загрузки чатов.<br>Проверьте подключение к сети.</span></div>`;
        }
    }
}

export async function openChatContextMenu(chatId: string, chatName: string, e: MouseEvent | TouchEvent) {
    if ((window as any).closeChatContextMenu) (window as any).closeChatContextMenu();
    
    const menu = document.createElement('div');
    menu.id = 'chat-context-menu';
    menu.className = 'fixed bg-white dark:bg-gray-800 shadow-xl rounded-xl py-2 w-56 z-[100] border border-gray-100 dark:border-gray-700 max-w-[90vw]';
    
    // Position menu
    let x = 0, y = 0;
    if ('touches' in e) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
    } else {
        x = (e as MouseEvent).clientX;
        y = (e as MouseEvent).clientY;
    }

    // Make sure it doesn't go off screen
    setTimeout(() => {
        const rect = menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 10;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 10;
        menu.style.left = `${Math.max(10, x)}px`;
        menu.style.top = `${Math.max(10, y)}px`;
    }, 0);
    
    const { data: profile } = await supabase.from('profiles').select('settings').eq('id', state.currentUser!.id).single();
    const isMuted = (profile?.settings?.muted_chats || []).includes(chatId);

    const isSavedMessages = chatId === 'new_saved_messages' || chatName === 'Избранное';

    menu.innerHTML = `
        <div class="px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-sm font-semibold truncate text-gray-900 dark:text-gray-100">${chatName}</div>
        ${!isSavedMessages ? `
        <button onclick="toggleMuteChatById('${chatId}'); closeChatContextMenu()" class="w-full text-left px-4 py-2.5 text-sm active:bg-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 dark:active:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors flex items-center gap-3">
            ${isMuted ? `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg> Включить звук` : `<svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h2.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z m7.414-2l4 4m0-4l-4 4m8-8l-4 4m0-4l4 4"></path></svg> Выключить звук`}
        </button>
        ${!state.isAdminStatus ? `
        <button onclick="deleteChatById('${chatId}'); closeChatContextMenu()" class="w-full text-left px-4 py-2.5 text-sm active:bg-red-50 hover:bg-red-50 dark:hover:bg-red-900/30 dark:active:bg-red-900/50 text-red-500 transition-colors flex items-center gap-3">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            Удалить чат
        </button>
        ` : ''}
        ` : `
        <button onclick="if(window.clearHistory) window.clearHistory(); closeChatContextMenu()" class="w-full text-left px-4 py-2.5 text-sm active:bg-orange-50 hover:bg-orange-50 dark:hover:bg-orange-900/30 dark:active:bg-orange-900/50 text-orange-500 transition-colors flex items-center gap-3">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            Очистить историю
        </button>
        `}
    `;
    document.body.appendChild(menu);

    const closeMenu = (e: any) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
            document.removeEventListener('touchstart', closeMenu);
        }
    };
    (window as any).closeChatContextMenu = () => {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu);
        document.removeEventListener('touchstart', closeMenu);
    };
    // small delay to avoid instant close from the same touch
    setTimeout(() => {
        document.addEventListener('mousedown', closeMenu);
        document.addEventListener('touchstart', closeMenu);
    }, 50);
}

export async function toggleMuteChatById(chatId: string) {
    const { data: profile } = await supabase.from('profiles').select('settings').eq('id', state.currentUser!.id).single();
    const settings = profile?.settings || {};
    const mutedChats = settings.muted_chats || [];
    
    if (mutedChats.includes(chatId)) {
        settings.muted_chats = mutedChats.filter((id: string) => id !== chatId);
    } else {
        settings.muted_chats = [...mutedChats, chatId];
    }
    await supabase.from('profiles').update({ settings }).eq('id', state.currentUser!.id);
    loadChats();
    // if active, could update UI too
}

export async function deleteChatById(chatId: string) {
    const confirmed = await customConfirm('Удалить этот чат? Действие необратимо.');
    if (!confirmed) return;
    
    await supabase.from('chats').delete().eq('id', chatId);
    
    if (state.activeChatId === chatId) {
        state.activeChatId = null;
        document.getElementById('chat-area')!.classList.add('hidden');
        document.getElementById('chat-area')!.classList.remove('flex');
        document.getElementById('sidebar')!.classList.remove('hidden');
    }
    loadChats();
}

export function closeChat() {
    import('./utils').then(m => m.closeChatMobile());
    
    // Hide admin banner
    const adminBanner = document.getElementById('admin-incognito-banner');
    if (adminBanner) {
        adminBanner.classList.add('hidden');
    }
    
    // Reset view right pane to initial state
    document.getElementById('current-chat-name')!.innerText = 'Выберите чат';
    document.getElementById('current-chat-status')!.innerText = '';
    const avatar = document.getElementById('chat-header-avatar')!;
    avatar.className = 'hidden';
    
    document.getElementById('messages-list')!.innerHTML = `
        <div class="flex h-full items-center justify-center">
            <div class="bg-black/40 dark:bg-black/60 text-white px-5 py-2 rounded-full text-sm backdrop-blur-md shadow-lg">Выберите чат для начала общения</div>
        </div>
    `;
    
    // Search UI cleanup
    const searchBar = document.getElementById('chat-search-bar');
    if (searchBar) {
        searchBar.classList.add('hidden');
        (document.getElementById('chat-search-input-box') as HTMLInputElement).value = '';
        (document.getElementById('chat-search-date') as HTMLInputElement).value = '';
        document.getElementById('chat-search-results')!.classList.add('hidden');
    }
    const searchBtn = document.getElementById('search-chat-btn');
    if (searchBtn) searchBtn.classList.add('hidden');

    const inputArea = document.getElementById('input-area');
    if (inputArea) inputArea.style.display = 'none';
}

export function updateTypingStatus() {
    const statusEl = document.getElementById('current-chat-status')!;
    if (!statusEl) return;
    
    if (state.typingUsers.size > 0) {
        const users = Array.from(state.typingUsers.values());
        const first = users[0];
        
        let actionText = 'печатает...';
        if (first.action === 'recording_voice') actionText = 'записывает аудио...';
        else if (first.action === 'recording_video') actionText = 'записывает видео...';
        else if (first.action === 'uploading_file') actionText = 'отправляет файл...';
        
        if (state.activeChatIsGroup) {
            statusEl.innerText = `${first.userName} ${actionText}`;
        } else {
            statusEl.innerText = actionText;
        }
        statusEl.className = 'text-xs font-medium text-blue-500 animate-pulse';
    } else {
        // Restore original status
        if(!state.activeChatIsGroup && state.activeChatOtherUser) {
            const isTechSupport = state.activeChatOtherUser.settings?.is_tech_support === true;
            if (isTechSupport) {
                statusEl.innerText = 'Техническая поддержка';
                statusEl.className = 'text-xs font-medium text-gray-500 dark:text-gray-400';
            } else {
                const status = getStatusText(state.activeChatOtherUser.is_online, state.activeChatOtherUser.last_seen);
                statusEl.innerText = status;
                statusEl.className = `text-xs font-medium ${status === 'в сети' ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`;
            }
        } else if (!state.activeChatIsGroup && !state.activeChatOtherUser) {
            statusEl.innerText = '';
            statusEl.className = '';
        } else {
            statusEl.innerText = state.activeChatDescription || 'Группа';
            statusEl.className = 'text-xs text-gray-500 dark:text-gray-400 font-medium';
        }
    }
}

export function updateChatInputUI() {
    const inputArea = document.getElementById('input-area');
    const blockedArea = document.getElementById('blocked-area');
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    
    const videoCallBtn = document.getElementById('video-call-btn');
    const audioCallBtn = document.getElementById('audio-call-btn');
    
    let isBlockedByMe = false;
    let isBlockedByThem = false;

    if (!state.activeChatIsGroup && state.activeChatOtherUser) {
        const mySettings = state.currentProfile?.settings || {};
        const otherSettings = state.activeChatOtherUser?.settings || {};
        isBlockedByMe = (mySettings.blocked_users || []).includes(state.activeChatOtherUser.id);
        isBlockedByThem = (otherSettings.blocked_users || []).includes(state.currentUser.id);
    }
    
    // Calls
    const isSavedMessages = !state.activeChatIsGroup && (!state.activeChatMembers || state.activeChatMembers.filter((m: any) => m.user_id !== state.currentUser?.id).length === 0);
    
    if (videoCallBtn && audioCallBtn) {
        if (state.activeChatIsGroup || state.isAdminStatus || state.currentProfile?.settings?.is_tech_support || isSavedMessages) {
            videoCallBtn.classList.add('hidden');
            audioCallBtn.classList.add('hidden');
        } else {
            videoCallBtn.classList.remove('hidden');
            audioCallBtn.classList.remove('hidden');
        }
        
        if (isBlockedByMe || isBlockedByThem) {
            videoCallBtn.classList.add('hidden');
            audioCallBtn.classList.add('hidden');
        }
    }

    if (state.activeChatType === 'channel') {
        const myRole = state.activeChatMembers?.find((m: any) => m.user_id === state.currentUser.id)?.role;
        const effectiveRole = state.isAdminStatus ? 'creator' : myRole;
        if (effectiveRole === 'creator' || effectiveRole === 'admin') {
            if (inputArea) inputArea.style.display = 'block';
            if (blockedArea) blockedArea.classList.add('hidden');
            if (messageInput) messageInput.placeholder = 'Написать...';
        } else {
            if (inputArea) inputArea.style.display = 'none';
            if (blockedArea) blockedArea.classList.add('hidden');
        }
    } else {
        if (isBlockedByMe || isBlockedByThem) {
            if (inputArea) inputArea.style.display = 'none';
            if (blockedArea) blockedArea.classList.remove('hidden');
        } else {
            if (inputArea) inputArea.style.display = 'block';
            if (blockedArea) blockedArea.classList.add('hidden');
            if (messageInput) messageInput.placeholder = 'Написать...';
        }
    }
}
(window as any).updateChatInputUI = updateChatInputUI;

export async function openChat(chatId: string, chatName: string, firstLetter: string, isGroup: boolean, chatType: string, members: any[], avatarUrl?: string, description?: string, isPublic?: boolean, skipPushState: boolean = false) {
    if (!skipPushState && window.location.hash !== '#chat') {
        window.history.pushState({ screen: 'chat', chatId }, '', '#chat');
    }

    if ((window as any).logic?.pauseAllMedia) {
        (window as any).logic.pauseAllMedia(undefined, true);
    }
    
    if (state.activeChatId && state.activeChatId !== chatId) {
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

    state.activeChatId = chatId;
    state.activeChatType = chatType as any;
    state.activeChatIsGroup = isGroup;
    state.activeChatDescription = description;
    state.activeChatIsPublic = isPublic || false;
    state.activeChatMembers = members || [];

    const updateHeaderInfo = () => {
        const statusEl = document.getElementById('current-chat-status')!;
        const isTechSupportChat = state.activeChatDescription === 'TECH_SUPPORT_CHAT';
        let isChattingWithSupportUser = false;
        
        if (!state.activeChatIsGroup) {
            state.activeChatOtherUser = state.activeChatMembers?.find((m: any) => m.user_id !== state.currentUser.id)?.profiles;
            if (state.activeChatOtherUser) {
                isChattingWithSupportUser = state.activeChatOtherUser.settings?.is_tech_support === true;
            }
        }
        
        const effectiveTechSupport = isTechSupportChat || isChattingWithSupportUser;
        state.isTechSupportChat = effectiveTechSupport; // store for other parts

        if (effectiveTechSupport) {
            statusEl.innerText = 'Техническая поддержка';
            statusEl.className = 'text-xs font-medium text-gray-500 dark:text-gray-400';
            return;
        }

        if(!state.activeChatIsGroup) {
            if(state.activeChatOtherUser) {
                const status = getStatusText(state.activeChatOtherUser.is_online, state.activeChatOtherUser.last_seen);
                statusEl.innerText = status;
                statusEl.className = `text-xs font-medium ${status === 'в сети' ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`;
            } else {
                statusEl.innerText = '';
                statusEl.className = '';
            }
        } else {
             statusEl.innerText = `${state.activeChatType === 'channel' ? 'Канал' : 'Группа'} • ${state.activeChatMembers ? state.activeChatMembers.length : 0} ${state.activeChatType === 'channel' ? 'подписчик(ов)' : 'участник(ов)'}`;
             statusEl.className = 'text-xs text-gray-500 dark:text-gray-400 font-medium';
        }
    };

    let isPremiumUser = false;
    if (chatType === 'direct' || chatType === 'private') {
        const otherUserProfile = members?.find((m: any) => m.user_id !== state.currentUser?.id)?.profiles;
        isPremiumUser = otherUserProfile?.is_premium && (!otherUserProfile.premium_until || new Date(otherUserProfile.premium_until) > new Date());
    }

    if (state.isAdminStatus && state.activeChatMembers.length === 0) {
        supabase.from('chat_members').select('user_id, role, profiles(id, username, display_name, last_seen, is_online, avatar_url, bio, settings, is_premium, premium_until)').eq('chat_id', chatId).then(({ data, error }) => {
            if (data) {
                state.activeChatMembers = data;
                updateHeaderInfo();
            }
        });
    }

    const premiumBadgeListHtml = isPremiumUser ? `<span class="inline-flex items-center justify-center ml-1 shrink-0" title="Vibegram Premium"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-4 h-4 object-contain" alt="Premium"></span>` : '';
    document.getElementById('current-chat-name')!.innerHTML = `<span class="truncate shrink">${chatName}</span>${premiumBadgeListHtml}`;
    
    const headerContainer = document.getElementById('chat-header-container');
    if (headerContainer) {
        headerContainer.classList.add('cursor-pointer', 'hover:bg-gray-50', 'dark:hover:bg-gray-800');
    }
    
    const inputAreaEl = document.getElementById('input-area');
    if (inputAreaEl) inputAreaEl.style.display = 'block';
    
    // Update active chat styling in sidebar
    document.querySelectorAll('#chats-list > div').forEach(el => {
        if ((el as HTMLElement).dataset.chatId === chatId) {
            el.classList.add('bg-blue-50', 'dark:bg-blue-900/40');
        } else {
            el.classList.remove('bg-blue-50', 'dark:bg-blue-900/40', 'bg-blue-50/60', 'dark:bg-blue-900/30');
        }
    });
    
    const videoCallBtn = document.getElementById('video-call-btn');
    const audioCallBtn = document.getElementById('audio-call-btn');
    
    // Search UI
    const searchBtn = document.getElementById('search-chat-btn');
    if (searchBtn) searchBtn.classList.remove('hidden');

    const isSavedMessages = !isGroup && (!state.activeChatMembers || state.activeChatMembers.filter((m: any) => m.user_id !== state.currentUser?.id).length === 0);

    if (videoCallBtn && audioCallBtn) {
        if (isGroup || state.isAdminStatus || state.currentProfile?.settings?.is_tech_support || isSavedMessages) {
            videoCallBtn.classList.add('hidden');
            audioCallBtn.classList.add('hidden');
        } else {
            videoCallBtn.classList.remove('hidden');
            audioCallBtn.classList.remove('hidden');
        }
    }
    
    // Clear previous channel and typing state
    if (state.chatChannel) {
        supabase.removeChannel(state.chatChannel);
        state.chatChannel = null;
    }
    state.typingUsers.forEach(t => clearTimeout(t.timer));
    state.typingUsers.clear();
    updateTypingStatus();

    // Setup broadcast channel for typing indicators
    state.chatChannel = supabase.channel(`room:${chatId}`);
    state.chatChannel
        .on('broadcast', { event: 'typing' }, (payload: any) => {
            if (state.isTechSupportChat) return;
            if (payload.payload.userId === state.currentUser.id) return;
            
            const userId = payload.payload.userId;
            const action = payload.payload.action; // 'typing', 'recording_voice', 'recording_video', 'uploading_file'
            const userName = payload.payload.userName;
            
            if (state.typingUsers.has(userId)) {
                clearTimeout(state.typingUsers.get(userId)!.timer);
            }
            
            const timer = setTimeout(() => {
                state.typingUsers.delete(userId);
                updateTypingStatus();
            }, 3000);
            
            state.typingUsers.set(userId, { action, timer, userName });
            updateTypingStatus();
        })
        .subscribe();
    
    const avatar = document.getElementById('chat-header-avatar')!;
    avatar.classList.remove('hidden'); avatar.classList.add('flex');

    const isSavedMsgHeader = !isGroup && (!members || members.filter((m: any) => m.user_id !== state.currentUser?.id).length === 0) || chatName === 'Избранное';

    if (isSavedMsgHeader) {
        avatar.innerHTML = `<div class="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">И</div>`;
        avatar.className = `w-10 h-10 mr-3 shadow-sm relative rounded-full shrink-0 flex items-center justify-center text-white`;
    } else if (avatarUrl) {
        avatar.innerHTML = `<div class="w-full h-full rounded-full overflow-hidden relative"><img src="${avatarUrl}" class="w-full h-full object-cover"></div>`;
        avatar.className = `w-10 h-10 mr-3 shadow-sm relative rounded-full shrink-0 flex items-center justify-center text-white`;
    } else {
        avatar.innerHTML = `<div class="w-full h-full rounded-full overflow-hidden relative flex items-center justify-center">${firstLetter}</div>`;
        avatar.className = `w-10 h-10 bg-gradient-to-br ${isGroup ? 'from-emerald-400 to-teal-500' : 'from-blue-400 to-indigo-500'} rounded-full flex items-center justify-center text-white font-bold mr-3 shadow-sm relative shrink-0`;
    }

    const statusEl = document.getElementById('current-chat-status')!;
    if (typeof updateHeaderInfo !== 'undefined') updateHeaderInfo();

    updateChatInputUI();

    const adminBanner = document.getElementById('admin-incognito-banner');
    if (adminBanner) {
        if (state.isAdminStatus) {
            adminBanner.classList.remove('hidden');
        } else {
            adminBanner.classList.add('hidden');
        }
    }

    if (window.innerWidth < 768) {
        document.getElementById('sidebar')!.classList.add('hidden');
        document.getElementById('chat-area')!.classList.remove('hidden');
    }
    
    if ((window as any).handleInput) {
        (window as any).handleInput();
    }
    
    // Fast chat switching: show loader
    const list = document.getElementById('messages-list')!;
    list.innerHTML = '<div class="flex h-full items-center justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>';
    
    loadMessages(chatId, true);
    markMessagesAsRead(chatId);
}

(window as any).toggleChatSearch = () => {
    const searchBar = document.getElementById('chat-search-bar');
    if (!searchBar) return;
    if (searchBar.classList.contains('hidden')) {
        searchBar.classList.remove('hidden');
        document.getElementById('chat-search-input-box')?.focus();
    } else {
        searchBar.classList.add('hidden');
        (document.getElementById('chat-search-input-box') as HTMLInputElement).value = '';
        (document.getElementById('chat-search-date') as HTMLInputElement).value = '';
        document.getElementById('chat-search-results')!.classList.add('hidden');
    }
};

(window as any).performChatSearch = async () => {
    if (!state.activeChatId) return;
    const input = (document.getElementById('chat-search-input-box') as HTMLInputElement).value.trim();
    const dateInput = (document.getElementById('chat-search-date') as HTMLInputElement).value;
    const resultsContainer = document.getElementById('chat-search-results')!;
    
    if (!input && !dateInput) {
        resultsContainer.classList.add('hidden');
        return;
    }

    try {
        let query = supabase.from('messages').select('id, content, created_at, profiles(display_name)').eq('chat_id', state.activeChatId).order('created_at', { ascending: false }).limit(30);
        
        if (input) {
            query = query.ilike('content', `%${input}%`);
        }
        if (dateInput) {
            const startDate = new Date(dateInput);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(dateInput);
            endDate.setHours(23, 59, 59, 999);
            query = query.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());
        }

        const { data, error } = await query;
        if (error) throw error;

        resultsContainer.classList.remove('hidden');
        if (data && data.length > 0) {
            resultsContainer.innerHTML = data.map(msg => `
                <div class="text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition" onclick="window.highlightMessage('${msg.id}')">
                    <span class="font-semibold text-gray-700 dark:text-gray-300">${(Array.isArray(msg.profiles) ? msg.profiles[0]?.display_name : (msg.profiles as any)?.display_name) || 'Неизвестно'}:</span>
                    <span class="text-gray-600 dark:text-gray-400 line-clamp-1 break-words">${msg.content || 'Медиа сообщение'}</span>
                    <span class="text-[10px] text-gray-400">${new Date(msg.created_at).toLocaleDateString()}</span>
                </div>
            `).join('');
        } else {
            resultsContainer.innerHTML = `<div class="text-xs text-gray-500 p-2">Ничего не найдено</div>`;
        }
    } catch(e) {
        console.error(e);
        resultsContainer.innerHTML = `<div class="text-xs text-red-500 p-2">Ошибка поиска</div>`;
    }
};

(window as any).highlightMessage = (msgId: string) => {
    const wrapperEl = document.getElementById(`msg-wrapper-${msgId}`);
    const innerEl = document.getElementById(`msg-${msgId}`);
    if (wrapperEl && innerEl) {
        wrapperEl.scrollIntoView({behavior: 'smooth', block: 'center'});
        
        innerEl.classList.remove('jump-highlight');
        innerEl.classList.remove('!ring-4', '!ring-blue-500', '!bg-blue-500/40', '!scale-[1.02]', 'transition-all', 'duration-300', 'duration-1000');
        void innerEl.offsetWidth;
        
        innerEl.classList.add('!ring-4', '!ring-blue-500', '!bg-blue-500/40', '!scale-[1.02]', 'transition-all', 'duration-300');
        setTimeout(() => {
            innerEl.classList.replace('duration-300', 'duration-1000');
            innerEl.classList.remove('!ring-4', '!ring-blue-500', '!bg-blue-500/40', '!scale-[1.02]');
        }, 1500);
    } else {
        import('./utils').then(m => m.customToast('Сообщение не найдено на экране (может потребоваться прокрутка).'));
    }
};
