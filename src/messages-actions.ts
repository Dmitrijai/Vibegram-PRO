import { supabase, state } from './supabase';
import { scrollToBottom, customAlert, customConfirm, customPrompt, closeModal, customToast } from './utils';
import { isSelectionMode, toggleSelectionMode, toggleMessageSelection, deleteSelectedMessages, forwardSelectedMessages, confirmForwardMultiple, selectedMessages } from './selection';
import { openLightbox, closeLightbox, lightboxNext, lightboxPrev } from './lightbox';
import { toggleReactionMenu, toggleReaction, toggleMessageMenu, toggleEmojiMenu, sendEmojiMessage, getNotoEmojiUrl, closeAllMessageMenus, adjustMenuPosition, generateReactionsHtml } from './reactions';

import { loadMessages } from "./messages-core";
export function replyToMessage(id: string, content: string, senderName: string) {
    if (isSelectionMode && selectedMessages.size > 0) {
        customToast('Нельзя ответить на несколько сообщений');
        return;
    }
    state.replyingTo = { id, content, senderName };
    state.forwardingMsg = null;
    
    document.getElementById('reply-preview')!.classList.remove('hidden');
    document.getElementById('reply-preview-name')!.textContent = senderName;
    document.getElementById('reply-preview-text')!.textContent = content || 'Вложение';
    
    const inputArea = document.getElementById('input-area');
    if (inputArea && inputArea.style.display === 'none') {
        inputArea.style.display = 'block';
    }
    
    const input = document.getElementById('message-input') as HTMLTextAreaElement;
    if (input) input.focus();
}
export function cancelReply() {
    state.replyingTo = null;
    state.forwardingMsg = null;
    document.getElementById('reply-preview')!.classList.add('hidden');
    
    if (state.activeChatType === 'channel') {
        import('./chat').then(m => {
            // We need to check if the user is a creator/admin, if not hide the input area again
            supabase.from('chat_members').select('role').eq('chat_id', state.activeChatId).eq('user_id', state.currentUser.id).single().then(({data}) => {
                if (!data || (data.role !== 'creator' && data.role !== 'admin')) {
                    const el = document.getElementById('input-area');
                    if (el) el.style.display = 'none';
                }
            });
        });
    }
}
export async function forwardMessage(id: string, content: string, senderName: string) {
    if (isSelectionMode && selectedMessages.size > 0) {
        if (!selectedMessages.has(id)) {
            selectedMessages.add(id);
        }
        forwardSelectedMessages();
        return;
    }
    state.forwardSelectedChats = [];
    const modal = document.getElementById('modal-content')!;
    modal.innerHTML = `
        <div class="p-6">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">Переслать сообщение</h3>
                <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors">✕</button>
            </div>
            <div id="forward-chats-list" class="max-h-80 overflow-y-auto space-y-1 mb-6">
                <div class="flex justify-center p-4"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div></div>
            </div>
            <button id="confirm-forward-btn" onclick="confirmForward('${id}', decodeURIComponent('${encodeURIComponent(content).replace(/'/g, "%27")}'), '${senderName}')" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-md opacity-50 cursor-not-allowed" disabled>
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
    
    // Check if Saved Messages exists, if not construct a virtual one
    let savedMessagesChat = chats?.find(c => !c.type.includes('group') && !c.type.includes('channel') && (!c.chat_members?.filter((m: any) => m.user_id !== state.currentUser.id)?.length));
    
    let renderedChats = chats ? [...chats] : [];
    
    if (savedMessagesChat) {
        renderedChats = renderedChats.filter(c => c.id !== savedMessagesChat.id);
        renderedChats.unshift(savedMessagesChat); // put it to the front
    }
    
    const list = document.getElementById('forward-chats-list')!;
    list.innerHTML = '';
    
    renderedChats.forEach((chat: any) => {
        const isGroup = chat.type === 'group' || chat.type === 'channel';
        let isSavedMessages = false;
        let chatName = chat.title;
        let avatarUrl = chat.avatar_url;
        
        let isPremiumUser = false;
        
        if (!isGroup) {
            const others = chat.chat_members?.filter((m: any) => m.user_id !== state.currentUser.id);
            if (!others || others.length === 0) {
                isSavedMessages = true;
                chatName = 'Избранное';
            } else {
                const other = others[0];
                if (other?.profiles) {
                    chatName = other.profiles.display_name || other.profiles.username;
                    avatarUrl = other.profiles.avatar_url;
                    isPremiumUser = other.profiles.is_premium && (!other.profiles.premium_until || new Date(other.profiles.premium_until) > new Date());
                }
            }
        }
        
        const premiumBadgeHtml = isPremiumUser ? `<div class="absolute -top-1 -left-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm border border-gray-200 dark:border-gray-700 z-50 w-4 h-4 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : '';

        const firstLetter = (chatName || 'C')[0].toUpperCase();
        
        let avatarHtml;
        if (isSavedMessages) {
            avatarHtml = `<div class="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-sm overflow-hidden relative">И</div>`;
        } else {
            avatarHtml = avatarUrl 
                ? `<div class="w-full h-full rounded-full overflow-hidden relative"><img src="${avatarUrl}" class="w-full h-full object-cover"></div>` 
                : `<div class="w-full h-full bg-gradient-to-br ${isGroup ? 'from-emerald-400 to-teal-500' : 'from-blue-400 to-indigo-500'} rounded-full flex items-center justify-center text-white font-bold text-sm overflow-hidden relative">${firstLetter}</div>`;
        }

        const div = document.createElement('div');
        div.className = 'flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl cursor-pointer transition-colors group';
        div.onclick = () => (window as any).toggleForwardChatSelection(chat.id);
        
        div.innerHTML = `
            <div class="w-10 h-10 shrink-0 relative">${avatarHtml}${premiumBadgeHtml}</div>
            <div class="flex-1 min-w-0">
                <div class="font-semibold text-gray-800 dark:text-gray-100 truncate text-sm">${chatName || 'Неизвестно'}</div>
                <div class="text-xs text-gray-500">${isSavedMessages ? 'Избранное' : (isGroup ? 'Группа' : 'Личный чат')}</div>
            </div>
            <div id="forward-check-${chat.id}" class="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center transition-all">
                <svg class="w-4 h-4 text-white hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
        `;
        list.appendChild(div);
    });
}
export function toggleForwardChatSelection(chatId: string) {
    const index = state.forwardSelectedChats.indexOf(chatId);
    const check = document.getElementById(`forward-check-${chatId}`)!;
    const icon = check.querySelector('svg')!;
    const btn = document.getElementById('confirm-forward-btn') as HTMLButtonElement;

    if (index === -1) {
        state.forwardSelectedChats.push(chatId);
        check.classList.add('bg-blue-500', 'border-blue-500');
        icon.classList.remove('hidden');
    } else {
        state.forwardSelectedChats.splice(index, 1);
        check.classList.remove('bg-blue-500', 'border-blue-500');
        icon.classList.add('hidden');
    }

    const count = state.forwardSelectedChats.length;
    btn.disabled = count === 0;
    btn.classList.toggle('opacity-50', count === 0);
    btn.classList.toggle('cursor-not-allowed', count === 0);
    btn.textContent = count > 0 ? `Отправить (${count})` : 'Отправить';
}
export async function confirmForward(msgId: string, content: string, senderName: string) {
    if (state.forwardSelectedChats.length === 0) return;
    
    const btn = document.getElementById('confirm-forward-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>';

    // Fetch original message to get its media and message_type
    const { data: originalMsg } = await supabase
        .from('messages')
        .select('media, message_type')
        .eq('id', msgId)
        .single();

    const forwardMedia = {
        type: 'forward',
        original_id: msgId,
        original_content: content,
        original_sender: senderName
    };

    let mediaArr = originalMsg?.media ? JSON.parse(JSON.stringify(originalMsg.media)) : [];
    if (!Array.isArray(mediaArr)) mediaArr = [];
    mediaArr.push(forwardMedia);

    const messageType = originalMsg?.message_type || 'text';

    const promises = state.forwardSelectedChats.map(chatId => {
        return supabase.from('messages').insert({
            chat_id: chatId,
            sender_id: state.currentUser.id,
            content: content,
            media: mediaArr,
            message_type: messageType
        });
    });

    await Promise.all(promises);
    closeModal();
    customToast(`Сообщение переслано (${state.forwardSelectedChats.length})`);
    
    // Broadcast for all
    state.forwardSelectedChats.forEach(chatId => {
        import('./supabase').then(s => s.broadcastUpdate(chatId, 'message'));
    });
    
    // If current chat is one of the recipients, reload messages
    if (state.forwardSelectedChats.includes(state.activeChatId!)) {
        loadMessages(state.activeChatId!);
        import('./chat').then(c => c.loadChats());
    }
}
export function selectForwardChat() { /* Deprecated */ }
export async function editMessage(messageId: string, currentContent: string) {
    closeAllMessageMenus();
    if (isSelectionMode && selectedMessages.size > 0) {
        customToast('Нельзя редактировать несколько сообщений');
        return;
    }
    
    try {
        const { data: msg } = await supabase.from('messages').select('message_type, media').eq('id', messageId).single();
        if (msg?.message_type === 'poll') {
            const { openEditPollModal } = await import('./polls');
            openEditPollModal(messageId, msg.media[0]);
            return;
        }
    } catch (e) {
        console.error('Error checking message type:', e);
    }

    const newContent = await customPrompt('Редактировать сообщение:', currentContent);
    if (newContent !== null && newContent.trim() !== currentContent) {
        await supabase.from('messages').update({ content: newContent.trim() }).eq('id', messageId).eq('sender_id', state.currentUser.id);
        loadMessages(state.activeChatId!);
        import('./chat').then(c => c.loadChats());
        import('./supabase').then(s => s.broadcastUpdate(state.activeChatId!, 'update'));
    }
}
export async function deleteMessage(messageId: string) {
    closeAllMessageMenus();
    if (isSelectionMode && selectedMessages.size > 0) {
        if (!selectedMessages.has(messageId)) {
            selectedMessages.add(messageId);
        }
        deleteSelectedMessages();
        return;
    }
    const confirmed = await customConfirm('Удалить это сообщение?');
    if (!confirmed) return;
    
    // Soft delete media files if any
    const { data: msg } = await supabase.from('messages').select('media').eq('id', messageId).eq('sender_id', state.currentUser.id).single();
    if (msg?.media && Array.isArray(msg.media)) {
        const utils = await import('./utils');
        for (const file of msg.media) {
            if (file.url && file.url.includes('cloudinary.com')) {
                await utils.softDeleteCloudinaryFile(file.url);
            }
        }
    }

    await supabase.from('messages').delete().eq('id', messageId).eq('sender_id', state.currentUser.id);
    loadMessages(state.activeChatId!);
    import('./chat').then(c => c.loadChats());
    import('./supabase').then(s => s.broadcastUpdate(state.activeChatId!, 'delete'));
}
export function copyMessageText(content: string) {
    if (isSelectionMode && selectedMessages.size > 0) {
        customToast('Копирование нескольких сообщений пока не поддерживается');
        return;
    }
    navigator.clipboard.writeText(content);
    closeAllMessageMenus();
    customToast('Текст скопирован');
}
