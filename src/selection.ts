import { state, supabase } from './supabase';
import { customConfirm, customToast, closeModal } from './utils';
import { loadMessages } from './messages';

export let isSelectionMode = false;
export let selectedMessages = new Set<string>();

export function toggleSelectionMode(enable?: boolean) {
    isSelectionMode = enable !== undefined ? enable : !isSelectionMode;
    if (!isSelectionMode) {
        selectedMessages.clear();
    }
    updateSelectionUI();
}

export function toggleMessageSelection(msgId: string) {
    if (selectedMessages.has(msgId)) {
        selectedMessages.delete(msgId);
    } else {
        selectedMessages.add(msgId);
    }
    updateSelectionUI();
    
    // Update message visual state
    const msgEl = document.getElementById(`msg-wrapper-${msgId}`);
    if (msgEl) {
        const innerBubble = document.getElementById(`msg-${msgId}`);
        if (selectedMessages.has(msgId)) {
            msgEl.classList.add('bg-blue-500/10', 'dark:bg-blue-500/20', 'rounded-2xl', 'p-1', '-m-1');
            if (innerBubble) {
                innerBubble.classList.remove('select-none');
                innerBubble.classList.add('select-text');
            }
        } else {
            msgEl.classList.remove('bg-blue-500/10', 'dark:bg-blue-500/20', 'rounded-2xl', 'p-1', '-m-1');
            if (innerBubble) {
                innerBubble.classList.add('select-none');
                innerBubble.classList.remove('select-text');
            }
        }
    }
}

export function updateSelectionUI() {
    let bar = document.getElementById('selection-action-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'selection-action-bar';
        bar.className = 'absolute top-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between z-50 transform transition-transform duration-300 -translate-y-full';
        bar.innerHTML = `
            <div class="flex items-center gap-4">
                <button onclick="toggleSelectionMode(false)" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium">Отмена</button>
                <span id="selection-count" class="font-bold text-gray-800 dark:text-gray-100">0</span>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="forwardSelectedMessages()" class="p-2 text-gray-600 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Переслать">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"></path></svg>
                </button>
                <button onclick="deleteSelectedMessages()" class="p-2 text-gray-600 hover:text-red-500 dark:text-gray-300 dark:hover:text-red-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Удалить">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
        document.getElementById('chat-container')?.appendChild(bar);
    }
    
    const countEl = document.getElementById('selection-count');
    if (countEl) countEl.textContent = selectedMessages.size.toString();
    
    if (isSelectionMode) {
        bar.classList.remove('-translate-y-full');
        
        // Add checkboxes to all messages if not present
        document.querySelectorAll('.msg-wrapper').forEach(wrapper => {
            const msgId = wrapper.id.replace('msg-wrapper-', '');
            let checkbox = wrapper.querySelector('.msg-checkbox');
            if (!checkbox) {
                const checkboxHtml = `
                    <div class="msg-checkbox absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center transition-colors ${selectedMessages.has(msgId) ? 'bg-blue-500 border-blue-500' : ''}">
                        <svg class="w-3 h-3 text-white ${selectedMessages.has(msgId) ? 'opacity-100' : 'opacity-0'} transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                `;
                wrapper.insertAdjacentHTML('afterbegin', checkboxHtml);
                wrapper.classList.add('pl-8', 'cursor-pointer');
            } else {
                const isSelected = selectedMessages.has(msgId);
                checkbox.className = `msg-checkbox absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'}`;
                const svg = checkbox.querySelector('svg');
                if (svg) svg.setAttribute('class', `w-3 h-3 text-white ${isSelected ? 'opacity-100' : 'opacity-0'} transition-opacity`);
            }
            
            // Ensure click handler is set
            (wrapper as HTMLElement).onclick = (e) => {
                if (isSelectionMode) {
                    const sel = window.getSelection();
                    if (sel && sel.toString().trim() !== '') {
                        return; // user is selecting text
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    toggleMessageSelection(msgId);
                }
            };
        });
    } else {
        bar.classList.add('-translate-y-full');
        
        // Remove checkboxes
        document.querySelectorAll('.msg-checkbox').forEach(el => el.remove());
        document.querySelectorAll('.msg-wrapper').forEach(wrapper => {
            wrapper.classList.remove('pl-8', 'cursor-pointer', 'bg-blue-500/10', 'dark:bg-blue-500/20', 'rounded-2xl', 'p-1', '-m-1');
            (wrapper as HTMLElement).onclick = null;
        });
    }
}

export async function deleteSelectedMessages() {
    if (selectedMessages.size === 0) return;
    
    const confirmed = await customConfirm(`Удалить ${selectedMessages.size} сообщений?`);
    if (confirmed) {
        const ids = Array.from(selectedMessages);
        try {
            // Fetch messages to soft delete media
            const { data: msgsToDel } = await supabase.from('messages').select('media').in('id', ids).eq('sender_id', state.currentUser.id);
            if (msgsToDel) {
                const utils = await import('./utils');
                for (const msg of msgsToDel) {
                    if (msg.media && Array.isArray(msg.media)) {
                        for (const file of msg.media) {
                            if (file.url && file.url.includes('cloudinary.com')) {
                                await utils.softDeleteCloudinaryFile(file.url);
                            }
                        }
                    }
                }
            }

            const { error } = await supabase.from('messages').delete().in('id', ids).eq('sender_id', state.currentUser.id);
            if (error) throw error;
            
            ids.forEach(id => {
                const el = document.getElementById(`msg-wrapper-${id}`);
                if (el && el.classList.contains('self-end')) el.remove(); // Only remove if it was my message
                
                // Also remove from media grid if open
                const mediaEl = document.querySelector(`.media-item[data-msg-id="${id}"]`);
                if (mediaEl) mediaEl.remove();
            });
            
            toggleSelectionMode(false);
            if ((window as any).toggleMediaSelectionMode) {
                (window as any).toggleMediaSelectionMode(false);
            }
            customToast('Сообщения удалены');
        } catch (e) {
            console.error('Error deleting messages:', e);
            customToast('Ошибка при удалении');
        }
    }
}

export async function forwardSelectedMessages() {
    if (selectedMessages.size === 0) return;
    
    state.forwardSelectedChats = [];
    const modal = document.getElementById('modal-content')!;
    modal.innerHTML = `
        <div class="p-6">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">Переслать ${selectedMessages.size} сообщений</h3>
                <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors">✕</button>
            </div>
            <div id="forward-chats-list" class="max-h-80 overflow-y-auto space-y-1 mb-6">
                <div class="flex justify-center p-4"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div></div>
            </div>
            <button id="confirm-forward-btn" onclick="confirmForwardMultiple()" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-md opacity-50 cursor-not-allowed" disabled>
                Отправить
            </button>
        </div>
    `;
    document.getElementById('modal-overlay')!.classList.remove('hidden');

    const { data: members } = await supabase.from('chat_members').select('chat_id').eq('user_id', state.currentUser.id);
    if (!members || members.length === 0) {
        document.getElementById('forward-chats-list')!.innerHTML = '<div class="text-center text-gray-500 text-sm p-4">Нет доступных чатов</div>';
        return;
    }
    
    const { data: chats } = await supabase.from('chats').select('id, type, title, avatar_url, chat_members(user_id, profiles(username, display_name, avatar_url))').in('id', members.map(m => m.chat_id));
    
    const list = document.getElementById('forward-chats-list')!;
    list.innerHTML = '';
    
    chats?.forEach((chat: any) => {
        const isGroup = chat.type === 'group' || chat.type === 'channel';
        let chatName = chat.title;
        let avatarUrl = chat.avatar_url;
        
        if (!isGroup) {
            const otherMember = chat.chat_members.find((m: any) => m.user_id !== state.currentUser.id);
            if (otherMember) {
                chatName = otherMember.profiles.display_name || otherMember.profiles.username;
                avatarUrl = otherMember.profiles.avatar_url;
            } else {
                chatName = 'Избранное';
            }
        }
        
        const div = document.createElement('div');
        div.className = 'flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl cursor-pointer transition-colors';
        div.onclick = () => (window as any).toggleForwardChatSelection(chat.id);
        
        div.innerHTML = `
            <div class="relative">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
                    ${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover">` : chatName.charAt(0).toUpperCase()}
                </div>
                <div id="forward-check-${chat.id}" class="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center hidden scale-0 transition-transform">
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
            </div>
            <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 dark:text-gray-100 truncate">${chatName}</div>
            </div>
        `;
        list.appendChild(div);
    });
}

export async function confirmForwardMultiple() {
    if (state.forwardSelectedChats.length === 0 || selectedMessages.size === 0) return;
    
    const btn = document.getElementById('confirm-forward-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>';

    try {
        const ids = Array.from(selectedMessages);
        // Fetch original messages to get their content, media, and sender info
        const { data: originalMsgs, error: fetchError } = await supabase
            .from('messages')
            .select('id, content, media, message_type, profiles(display_name, username)')
            .in('id', ids)
            .order('created_at', { ascending: true }); // Keep chronological order
            
        if (fetchError) throw fetchError;
        if (!originalMsgs || originalMsgs.length === 0) throw new Error('Messages not found');

        const promises = state.forwardSelectedChats.map(async chatId => {
            // Insert messages one by one to maintain order
            for (const msg of originalMsgs) {
                const profiles = msg.profiles as any;
                const senderName = profiles?.display_name || profiles?.username || 'User';
                
                // Construct forward media object
                const forwardMedia = {
                    type: 'forward',
                    original_id: msg.id,
                    original_content: msg.content,
                    original_sender: senderName
                };
                
                // Combine existing media with forward info
                let newMedia = msg.media ? JSON.parse(JSON.stringify(msg.media)) : [];
                if (!Array.isArray(newMedia)) newMedia = [];
                newMedia.push(forwardMedia);

                await supabase.from('messages').insert({
                    chat_id: chatId,
                    sender_id: state.currentUser.id,
                    content: msg.content,
                    media: newMedia,
                    message_type: msg.message_type
                });
            }
        });

        await Promise.all(promises);
        
        closeModal();
        toggleSelectionMode(false);
        if ((window as any).toggleMediaSelectionMode) {
            (window as any).toggleMediaSelectionMode(false);
        }
        customToast('Сообщения пересланы');
    } catch (e) {
        console.error('Error forwarding messages:', e);
        customToast('Ошибка при пересылке');
        btn.disabled = false;
        btn.innerHTML = 'Отправить';
    }
}

(window as any).toggleSelectionMode = toggleSelectionMode;
(window as any).toggleMessageSelection = toggleMessageSelection;
(window as any).deleteSelectedMessages = deleteSelectedMessages;
(window as any).forwardSelectedMessages = forwardSelectedMessages;
(window as any).confirmForwardMultiple = confirmForwardMultiple;
