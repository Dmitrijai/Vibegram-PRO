import { state, supabase } from './supabase';
import { isSelectionMode } from './selection';
import { cancelReply, loadMessages } from './messages';
import { scrollToBottom } from './utils';

export function toggleReactionMenu(e: Event, msgId: string) {
    if (state.isTechSupportChat) return;
    if (isSelectionMode) {
        return; // Handled by wrapper onclick
    }
    e.stopPropagation();
    const menu = document.getElementById(`reaction-menu-${msgId}`);
    if (menu) {
        const isHidden = menu.classList.contains('hidden');
        closeAllMessageMenus();
        if (isHidden) {
            if (menu.innerHTML.trim() === '<!-- Emojis will be loaded dynamically on click -->' || menu.innerHTML.trim() === '') {
                 menu.innerHTML = ['👍', '👎', '❤️', '😂', '😮', '😢', '😡', '🤬', '🔥', '💯', '🤡', '💩', '🤔', '🎉'].map(emoji => `
                    <button onclick="toggleReaction('${msgId}', '${emoji}'); closeAllMessageMenus();" class="w-10 h-10 hover:scale-125 transition-transform p-1 flex items-center justify-center shrink-0">
                        <img src="${getNotoEmojiUrl(emoji)}" alt="${emoji}" loading="lazy" class="w-full h-full object-contain" onerror="this.onerror=null; this.outerHTML='<span class=\\'text-xl\\'>${emoji}</span>';">
                    </button>
                `).join('');
            }
            menu.classList.remove('hidden');
            menu.classList.add('flex');
            adjustMenuPosition(menu);
        }
    }
}

export async function toggleReaction(msgId: string, emoji: string) {
    if (state.isAdminStatus) return;
    if (isSelectionMode) {
        return; // Handled by wrapper onclick
    }
    try {
        const { data: msg, error: fetchError } = await supabase.from('messages').select('reactions').eq('id', msgId).single();
        if (fetchError || !msg) {
            console.error('Error fetching msg:', fetchError);
            return;
        }

        let reactions = msg.reactions || {};
        let users = reactions[emoji] || [];
        
        if (users.includes(state.currentUser.id)) {
            users = users.filter((id: string) => id !== state.currentUser.id);
            if (users.length === 0) {
                delete reactions[emoji];
            } else {
                reactions[emoji] = users;
            }
        } else {
            // Remove user from all other reactions first
            for (const key in reactions) {
                if (reactions[key].includes(state.currentUser.id)) {
                    reactions[key] = reactions[key].filter((id: string) => id !== state.currentUser.id);
                    if (reactions[key].length === 0) {
                        delete reactions[key];
                    }
                }
            }
            // Add to the new reaction
            users = reactions[emoji] || [];
            users.push(state.currentUser.id);
            reactions[emoji] = users;
        }
        
        const container = document.getElementById(`reactions-container-${msgId}`);
        if (container) {
            container.innerHTML = generateReactionsHtml(msgId, reactions);
        }
        
        const { error: updateError } = await supabase.from('messages').update({ reactions }).eq('id', msgId);
        if (updateError) {
            console.error('Error updating reactions:', updateError);
        }
    } catch (e) {
        console.error('toggleReaction exception:', e);
    }
}

export async function toggleMessageMenu(event: Event, msgId: string) {
    event.stopPropagation();
    
    const menu = document.getElementById(`msg-menu-${msgId}`);
    const isHidden = menu?.classList.contains('hidden');
    
    closeAllMessageMenus();
    
    if (isHidden && menu) {
        menu.classList.remove('hidden');
        menu.classList.add('flex');
        adjustMenuPosition(menu);
        
        const infoContainer = document.getElementById(`msg-info-${msgId}`);
        const infoContent = document.getElementById(`msg-info-content-${msgId}`);
        if (infoContainer && infoContent) {
            infoContainer.classList.remove('hidden');
            infoContainer.classList.add('flex');
            infoContent.innerHTML = '<div class="animate-pulse h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>';
            
            try {
                const { data: msg, error } = await supabase.from('messages').select('is_read, reactions').eq('id', msgId).single();
                if (error) throw error;
                
                let infoHtml = '';
                let readUsers = msg.reactions?.['__read__'] || [];
                
                if ((state.activeChatType === 'direct' || state.activeChatType === 'private') && msg.is_read && readUsers.length === 0 && state.activeChatOtherUser) {
                    readUsers = [state.activeChatOtherUser.id];
                }
                
                const isRead = msg.is_read || readUsers.length > 0;

                if (readUsers.length === 0) {
                    infoHtml += '<div class="flex items-center gap-2 mb-1"><svg class="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg> Доставлено</div>';
                }
                
                const allUserIds = new Set<string>();
                if (msg.reactions) {
                    for (const users of Object.values(msg.reactions)) {
                        (users as string[]).forEach(u => allUserIds.add(u));
                    }
                }
                
                const { data: profiles } = await supabase.from('profiles').select('id, display_name, username').in('id', Array.from(allUserIds));
                const profileMap = new Map((profiles || []).map(p => [p.id, p.display_name || p.username]));
                
                if (readUsers.length > 0) {
                    const readNames = readUsers.map((u: string) => profileMap.get(u) || 'User');
                    const checkmarks = '<svg class="w-4 h-4 text-blue-500 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 6L8.5 14.5L5 11"/><path d="M22 6L14.5 14.5L12 11.5"/></svg>';
                    
                    let html = `<div class="mt-1">`;
                    const displayItems = readNames.slice(0, 3);
                    const hiddenItems = readNames.slice(3);
                    const hasMore = hiddenItems.length > 0;
                    
                    html += `<div class="flex flex-col gap-1 text-xs">`;
                    displayItems.forEach((item, index) => {
                        html += `<div class="truncate text-gray-800 dark:text-gray-200 flex items-center">${index === 0 ? checkmarks : '<span class="w-5 inline-block"></span>'} ${item}</div>`;
                    });
                    
                    if (hasMore) {
                        html += `
                            <div id="read-${msgId}-hidden" class="hidden flex-col gap-1 mt-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                                ${hiddenItems.map(item => `<div class="truncate text-gray-800 dark:text-gray-200 flex items-center"><span class="w-5 inline-block"></span> ${item}</div>`).join('')}
                            </div>
                            <button onclick="event.stopPropagation(); const el = document.getElementById('read-${msgId}-hidden'); el.classList.toggle('hidden'); el.classList.toggle('flex'); this.textContent = this.textContent === 'Развернуть' ? 'Свернуть' : 'Развернуть'; setTimeout(() => { if(window.adjustMenuPosition) window.adjustMenuPosition(this.closest('.msg-menu-dropdown')); }, 10);" class="text-blue-500 hover:text-blue-600 text-[11px] text-left mt-1 font-medium transition-colors ml-5">Развернуть</button>
                        `;
                    }
                    html += `</div></div>`;
                    infoHtml += html;
                }

                if (msg.reactions) {
                    const reactionEntries = Object.entries(msg.reactions).filter(([emoji]) => emoji !== '__read__');
                    if (reactionEntries.length > 0) {
                        let allReactions: {emoji: string, name: string}[] = [];
                        for (const [emoji, users] of reactionEntries) {
                            (users as string[]).forEach(u => {
                                allReactions.push({ emoji, name: profileMap.get(u) || 'User' });
                            });
                        }
                        infoHtml += renderExpandableReactions('Реакции', allReactions, `react-${msgId}`);
                    }
                }
                
                infoContent.innerHTML = infoHtml;
                setTimeout(() => adjustMenuPosition(menu), 10);
            } catch (err) {
                infoContent.innerHTML = '<span class="text-red-500">Ошибка загрузки</span>';
                setTimeout(() => adjustMenuPosition(menu), 10);
            }
        }
    }
}

function renderExpandableList(title: string, items: string[], idPrefix: string) {
    if (items.length === 0) return '';
    
    const displayItems = items.slice(0, 3);
    const hiddenItems = items.slice(3);
    const hasMore = hiddenItems.length > 0;
    
    let html = `<div class="mt-2">`;
    if (title) {
        html += `<div class="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">${title}</div>`;
    }
    
    html += `<div class="flex flex-col gap-1 text-xs">`;
    displayItems.forEach(item => {
        html += `<div class="truncate text-gray-800 dark:text-gray-200">${item}</div>`;
    });
    
    if (hasMore) {
        html += `
            <div id="${idPrefix}-hidden" class="hidden flex-col gap-1 mt-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                ${hiddenItems.map(item => `<div class="truncate text-gray-800 dark:text-gray-200">${item}</div>`).join('')}
            </div>
            <button onclick="event.stopPropagation(); const el = document.getElementById('${idPrefix}-hidden'); el.classList.toggle('hidden'); el.classList.toggle('flex'); this.textContent = this.textContent === 'Развернуть' ? 'Свернуть' : 'Развернуть'; setTimeout(() => { if(window.adjustMenuPosition) window.adjustMenuPosition(this.closest('.msg-menu-dropdown')); }, 10);" class="text-blue-500 hover:text-blue-600 text-[11px] text-left mt-1 font-medium transition-colors">Развернуть</button>
        `;
    }
    
    html += `</div></div>`;
    return html;
}

function renderExpandableReactions(title: string, items: {emoji: string, name: string}[], idPrefix: string) {
    if (items.length === 0) return '';
    
    const displayItems = items.slice(0, 3);
    const hiddenItems = items.slice(3);
    const hasMore = hiddenItems.length > 0;
    
    let html = `<div class="mt-2"><div class="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">${title}</div>`;
    
    html += `<div class="flex flex-col gap-1 text-xs">`;
    displayItems.forEach(item => {
        html += `<div class="flex items-center gap-2 truncate text-gray-800 dark:text-gray-200"><img src="${getNotoEmojiUrl(item.emoji)}" class="w-3 h-3" onerror="this.onerror=null; this.outerHTML='<span>${item.emoji}</span>';"> <span>${item.name}</span></div>`;
    });
    
    if (hasMore) {
        html += `
            <div id="${idPrefix}-hidden" class="hidden flex-col gap-1 mt-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                ${hiddenItems.map(item => `<div class="flex items-center gap-2 truncate text-gray-800 dark:text-gray-200"><img src="${getNotoEmojiUrl(item.emoji)}" class="w-3 h-3" onerror="this.onerror=null; this.outerHTML='<span>${item.emoji}</span>';"> <span>${item.name}</span></div>`).join('')}
            </div>
            <button onclick="event.stopPropagation(); const el = document.getElementById('${idPrefix}-hidden'); el.classList.toggle('hidden'); el.classList.toggle('flex'); this.textContent = this.textContent === 'Развернуть' ? 'Свернуть' : 'Развернуть'; setTimeout(() => { if(window.adjustMenuPosition) window.adjustMenuPosition(this.closest('.msg-menu-dropdown')); }, 10);" class="text-blue-500 hover:text-blue-600 text-[11px] text-left mt-1 font-medium transition-colors">Развернуть</button>
        `;
    }
    
    html += `</div></div>`;
    return html;
}

const EMOJIS = ['👍', '👎', '❤️', '😂', '😮', '😢', '😡', '🤬', '🔥', '🎉', '🤔', '😎', '🙌', '✨', '💯', '🙏', '👀', '💩', '🤡', '👻', '👽', '🤖', '🎃', '😺', '😻', '🙈', '🙉', '🙊', '💔', '💥'];

export function toggleEmojiMenu(e: Event) {
    if (state.isTechSupportChat) return;
    e.stopPropagation();
    const menu = document.getElementById('emoji-menu');
    if (menu) {
        if (menu.classList.contains('hidden')) {
            menu.classList.remove('hidden');
            if (menu.children[0].innerHTML.trim() === '') {
                menu.children[0].innerHTML = EMOJIS.map(emoji => `
                    <button type="button" onclick="sendEmojiMessage('${emoji}')" class="w-12 h-12 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl p-2 transition-colors flex items-center justify-center">
                        <img src="${getNotoEmojiUrl(emoji)}" alt="${emoji}" loading="lazy" class="w-full h-full object-contain hover:scale-110 transition-transform" onerror="this.onerror=null; this.outerHTML='<span class=\\'text-2xl\\'>${emoji}</span>';">
                    </button>
                `).join('');
            }
        } else {
            menu.classList.add('hidden');
        }
    }
}

export async function sendEmojiMessage(emoji: string) {
    const menu = document.getElementById('emoji-menu');
    if (menu) menu.classList.add('hidden');

    if (!state.activeChatId || !state.currentUser) return;

    let mediaArr: any[] = [];
    if (state.replyingTo) {
        mediaArr.push({
            type: 'reply',
            original_id: state.replyingTo.id,
            original_content: state.replyingTo.content,
            original_sender: state.replyingTo.senderName
        });
    }

    const { error } = await supabase.from('messages').insert({
        chat_id: state.activeChatId,
        sender_id: state.currentUser.id,
        content: emoji,
        media: mediaArr.length > 0 ? mediaArr : null,
        parent_id: state.replyingTo ? state.replyingTo.id : null
    });

    if (error) {
        console.error('Error sending emoji:', error);
    } else {
        cancelReply();
        if (state.activeChatId) {
            loadMessages(state.activeChatId);
            import('./supabase').then(s => s.broadcastUpdate(state.activeChatId!, 'reaction'));
        }
    }
}

export function getNotoEmojiUrl(emoji: string) {
    const codePoints = Array.from(emoji)
        .map(c => c.codePointAt(0)?.toString(16))
        .filter(c => c !== 'fe0f' && c !== undefined);
    
    const code = codePoints.join('_');
    return `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.webp`;
}

export function closeAllMessageMenus() {
    document.querySelectorAll('.msg-menu-dropdown').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('flex');
    });
    document.querySelectorAll('.reaction-menu-dropdown').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('flex');
    });
    document.getElementById('attach-menu')?.classList.add('hidden');
}

export function adjustMenuPosition(menu: HTMLElement | null) {
    if (!menu) return;
    requestAnimationFrame(() => {
        menu.style.transform = '';
        const rect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        let shiftX = 0;
        let shiftY = 0;
        
        if (rect.left < 8) shiftX = 8 - rect.left;
        else if (rect.right > viewportWidth - 8) shiftX = viewportWidth - 8 - rect.right;
        
        if (rect.top < 72) shiftY = 72 - rect.top;
        else if (rect.bottom > viewportHeight - 8) shiftY = viewportHeight - 8 - rect.bottom;
        
        if (shiftX !== 0 || shiftY !== 0) {
            menu.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
        }
    });
}

export function generateReactionsHtml(msgId: string, reactions: any) {
    let reactionsHtml = '';
    if (reactions && Object.keys(reactions).length > 0) {
        const visibleReactions = Object.entries(reactions).filter(([emoji]) => emoji !== '__read__');
        if (visibleReactions.length > 0) {
            reactionsHtml = '<div class="flex flex-wrap gap-1 mt-1">';
            for (const [emoji, users] of visibleReactions) {
                const userArray = users as string[];
                const hasMyReaction = userArray.includes(state.currentUser?.id);
                reactionsHtml += `
                    <button onclick="toggleReaction('${msgId}', '${emoji}')" class="reaction-btn flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border ${hasMyReaction ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' : 'bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'} hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
                        <img src="${getNotoEmojiUrl(emoji)}" alt="${emoji}" loading="lazy" class="w-4 h-4 object-contain" onerror="this.onerror=null; this.outerHTML='<span>${emoji}</span>';">
                        <span class="font-medium">${userArray.length}</span>
                    </button>
                `;
            }
            reactionsHtml += '</div>';
        }
    }
    return reactionsHtml;
}

(window as any).toggleMessageMenu = toggleMessageMenu;
(window as any).toggleReactionMenu = toggleReactionMenu;
(window as any).toggleReaction = toggleReaction;
(window as any).adjustMenuPosition = adjustMenuPosition;
(window as any).sendEmojiMessage = sendEmojiMessage;
