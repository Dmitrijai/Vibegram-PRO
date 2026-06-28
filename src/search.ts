import { supabase, state } from './supabase';
import { loadChats, openChat } from './chat';
import { escapeHtml } from './utils';

let searchTimeout: any;
export function searchUsers(q: string) {
    if (state.isAdminStatus) return;
    clearTimeout(searchTimeout);
    const resultsBox = document.getElementById('search-results')!;
    if (q.length < 2) { resultsBox.classList.add('hidden'); return; }
    
    searchTimeout = setTimeout(async () => {
        if (q.startsWith('vibe_')) {
            const { data: channel } = await supabase.from('chats').select('*').eq('invite_key', q).single();
            if (channel) {
                resultsBox.innerHTML = '';
                const title = escapeHtml(channel.title);
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors min-w-0';
                const avatarHtml = channel.avatar_url ? `<img src="${channel.avatar_url}" class="w-full h-full object-cover rounded-full">` : `<div class="w-full h-full flex justify-center items-center">${title[0]?.toUpperCase() || ''}</div>`;
                div.innerHTML = `<div class="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold overflow-hidden shrink-0">${avatarHtml}</div><div class="flex-1 min-w-0"><span class="font-semibold text-gray-800 dark:text-gray-100 truncate block">${title}</span><span class="text-xs text-gray-500 truncate block">По ключу-приглашению</span></div>`;
                div.onclick = () => { resultsBox.classList.add('hidden'); (document.getElementById('search-input') as HTMLInputElement).value = ''; joinChannelWithKey(channel, q); };
                resultsBox.appendChild(div);
                resultsBox.classList.remove('hidden');
            } else {
                resultsBox.innerHTML = '<div class="p-4 text-sm text-gray-500 text-center font-medium">Ключ не найден или уже использован</div>';
                resultsBox.classList.remove('hidden');
            }
            return;
        }

        const searchTerm = q.startsWith('@') ? q.slice(1) : q;
        
        const { data: usersRaw } = await supabase.from('profiles').select('*').or(`display_name.ilike.%${searchTerm}%,username.ilike.%${searchTerm}%`).neq('id', state.currentUser.id).limit(30);
        const { data: groups } = await supabase.from('chats').select('*').eq('type', 'group').eq('is_public', true).or(`title.ilike.%${searchTerm}%,username.ilike.%${searchTerm}%`).limit(10);
        const { data: channels } = await supabase.from('chats').select('*').eq('type', 'channel').eq('is_public', true).or(`title.ilike.%${searchTerm}%,username.ilike.%${searchTerm}%`).limit(10);
        
        const users = usersRaw?.filter(u => !(u.settings && u.settings.is_tech_support))?.slice(0, 10);

        if((!users || users.length === 0) && (!groups || groups.length === 0) && (!channels || channels.length === 0)) {
            resultsBox.innerHTML = '<div class="p-4 text-sm text-gray-500 text-center font-medium">Ничего не найдено</div>';
        } else {
            resultsBox.innerHTML = '';
            users?.forEach(u => {
                const nickname = escapeHtml(u.display_name || u.username);
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors min-w-0';
                const avatarHtml = u.avatar_url ? `<img src="${u.avatar_url}" class="w-full h-full object-cover rounded-full">` : `<div class="w-full h-full flex justify-center items-center">${nickname[0]?.toUpperCase() || ''}</div>`;
                const isPremiumUser = u.is_premium && (!u.premium_until || new Date(u.premium_until) > new Date());
                const premiumBadgeHtml = isPremiumUser ? `<div class="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm border border-gray-200 dark:border-gray-700 z-50 w-4 h-4 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : '';
                let usernameTag = u.username ? `<span class="text-xs text-gray-500 truncate block">@${escapeHtml(u.username)}</span>` : '';
                div.innerHTML = `<div class="w-10 h-10 shrink-0 relative"><div class="w-full h-full bg-blue-500 text-white rounded-full flex items-center justify-center font-bold overflow-hidden">${avatarHtml}</div>${premiumBadgeHtml}</div><div class="flex-1 min-w-0"><span class="font-semibold text-gray-800 dark:text-gray-100 truncate block">${nickname}</span>${usernameTag}</div>`;
                div.onclick = () => { resultsBox.classList.add('hidden'); (document.getElementById('search-input') as HTMLInputElement).value = ''; startChatWithUser(u); };
                resultsBox.appendChild(div);
            });
            groups?.forEach(g => {
                const title = escapeHtml(g.title);
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors min-w-0';
                const avatarHtml = g.avatar_url ? `<img src="${g.avatar_url}" class="w-full h-full object-cover rounded-full">` : `<div class="w-full h-full flex justify-center items-center">${title[0]?.toUpperCase() || ''}</div>`;
                let usernameTag = g.username ? ` • @${escapeHtml(g.username)}` : '';
                const verifiedBadge = g.is_verified ? `<span class="inline-flex items-center justify-center ml-1" title="Official"><svg class="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path></svg></span>` : '';
                div.innerHTML = `<div class="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold overflow-hidden shrink-0">${avatarHtml}</div><div class="flex-1 min-w-0"><span class="font-semibold text-gray-800 dark:text-gray-100 truncate flex items-center">${title}${verifiedBadge}</span><span class="text-xs text-gray-500 truncate block">Группа${usernameTag}</span></div>`;
                div.onclick = () => { resultsBox.classList.add('hidden'); (document.getElementById('search-input') as HTMLInputElement).value = ''; joinGroup(g); };
                resultsBox.appendChild(div);
            });
            channels?.forEach(c => {
                const title = escapeHtml(c.title);
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors min-w-0';
                const avatarHtml = c.avatar_url ? `<img src="${c.avatar_url}" class="w-full h-full object-cover rounded-full">` : `<div class="w-full h-full flex justify-center items-center">${title[0]?.toUpperCase() || ''}</div>`;
                let usernameTag = c.username ? ` • @${escapeHtml(c.username)}` : '';
                const verifiedBadge = c.is_verified ? `<span class="inline-flex items-center justify-center ml-1" title="Official"><svg class="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path></svg></span>` : '';
                div.innerHTML = `<div class="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold overflow-hidden shrink-0">${avatarHtml}</div><div class="flex-1 min-w-0"><span class="font-semibold text-gray-800 dark:text-gray-100 truncate flex items-center">${title}${verifiedBadge}</span><span class="text-xs text-gray-500 truncate block">Канал${usernameTag}</span></div>`;
                div.onclick = () => { resultsBox.classList.add('hidden'); (document.getElementById('search-input') as HTMLInputElement).value = ''; joinChannel(c); };
                resultsBox.appendChild(div);
            });
        }
        resultsBox.classList.remove('hidden');
    }, 300);
}

export async function joinChannelWithKey(channel: any, key: string) {
    const { data: existing } = await supabase.from('chat_members').select('*').eq('chat_id', channel.id).eq('user_id', state.currentUser.id).single();
    if (existing) {
        if (existing.role === 'pending') {
            await supabase.from('chat_members').update({ role: 'member' }).eq('chat_id', channel.id).eq('user_id', state.currentUser.id);
        }
    } else {
        await supabase.from('chat_members').insert({ chat_id: channel.id, user_id: state.currentUser.id, role: 'member' });
    }
    
    // Clear the key so it can't be used again
    await supabase.from('chats').update({ invite_key: null }).eq('id', channel.id);
    
    const { data: members } = await supabase.from('chat_members').select('user_id').eq('chat_id', channel.id);
    
    loadChats();
    openChat(channel.id, channel.title, channel.title[0].toUpperCase(), true, channel.type, members || [], channel.avatar_url, channel.description, channel.is_public);
}

export async function joinGroup(group: any) {
    const { data: existing } = await supabase.from('chat_members').select('*').eq('chat_id', group.id).eq('user_id', state.currentUser.id).single();
    if (existing) {
        if (existing.role === 'pending') {
            import('./utils').then(m => m.customAlert('Заявка на вступление уже отправлена. Ожидайте подтверждения.'));
        } else {
            const { data: members } = await supabase.from('chat_members').select('*, profiles(*)').eq('chat_id', group.id);
            import('./chat').then(m => m.openChat(group.id, group.title, group.title[0].toUpperCase(), true, group.type, members || [], group.avatar_url, group.description, group.is_public));
        }
    } else {
        await supabase.from('chat_members').insert({ chat_id: group.id, user_id: state.currentUser.id, role: 'pending' });
        import('./utils').then(m => m.customAlert('Заявка на вступление отправлена.'));
    }
}

export async function joinChannel(channel: any) {
    const { data: existing } = await supabase.from('chat_members').select('*').eq('chat_id', channel.id).eq('user_id', state.currentUser.id).single();
    if (!existing) {
        await supabase.from('chat_members').insert({ chat_id: channel.id, user_id: state.currentUser.id, role: 'member' });
        import('./utils').then(m => m.customAlert('Вы подписались на канал.'));
    }
    
    const { data: members } = await supabase.from('chat_members').select('*, profiles(*)').eq('chat_id', channel.id);
    loadChats();
    import('./chat').then(m => m.openChat(channel.id, channel.title, channel.title[0].toUpperCase(), true, 'channel', members || [], channel.avatar_url, channel.description, channel.is_public));
}

export async function startChatWithUser(userToFind: any) {
    const isSelf = userToFind.id === state.currentUser.id;
    let chatId;
    
    import('./utils').then(m => m.showLoadingModal('Открытие чата...'));

    if (isSelf) {
        const { data: myChats } = await supabase.from('chat_members').select('chat_id').eq('user_id', state.currentUser.id);
        const myChatIds = myChats?.map(c => c.chat_id) || [];
        if (myChatIds.length > 0) {
            const { data: allMembers } = await supabase.from('chat_members').select('chat_id, chats!inner(type)').in('chat_id', myChatIds).in('chats.type', ['private', 'direct']);
            const counts: Record<string, number> = {};
            allMembers?.forEach(m => counts[m.chat_id] = (counts[m.chat_id] || 0) + 1);
            const selfChatId = Object.keys(counts).find(id => counts[id] === 1);
            if (selfChatId) chatId = selfChatId;
        }
    } else {
        const { data: myChats } = await supabase.from('chat_members').select('chat_id').eq('user_id', state.currentUser.id);
        const { data: commonChats } = await supabase.from('chat_members').select('chat_id, chats!inner(type)').in('chat_id', myChats?.map(c => c.chat_id) || []).eq('user_id', userToFind.id).in('chats.type', ['direct', 'private']);
        if (commonChats && commonChats.length > 0) chatId = commonChats[0].chat_id;
    }

    if (!chatId) {
        const newChatId = crypto.randomUUID();
        const { error: chatErr } = await supabase.from('chats').insert({ id: newChatId, type: 'private' });
        if (chatErr) console.error("Chat Error", chatErr);
        chatId = newChatId;
        
        const membersToInsert = isSelf 
            ? [{ chat_id: chatId, user_id: state.currentUser.id }]
            : [{ chat_id: chatId, user_id: state.currentUser.id }, { chat_id: chatId, user_id: userToFind.id }];
            
        const { error: cmErr } = await supabase.from('chat_members').insert(membersToInsert);
        if (cmErr) console.error("CM Error", cmErr);
    }
    
    import('./utils').then(m => m.hideLoadingModal());
    openChat(chatId, isSelf ? 'Избранное' : (userToFind.display_name || userToFind.username), (userToFind.display_name || userToFind.username)[0].toUpperCase(), false, 'private', [{user_id: userToFind.id, profiles: userToFind}], userToFind.avatar_url);
    await import('./chat').then(m => m.loadChats());
}

export async function startDirectChatById(userId: string) {
    import('./utils').then(m => m.showLoadingModal('Открытие чата...'));
    const { data: userToFind } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (userToFind) {
        import('./utils').then(m => m.closeModal());
        startChatWithUser(userToFind);
    } else {
        import('./utils').then(m => {
            m.hideLoadingModal();
            m.customAlert('Пользователь не найден');
        });
    }
}

export async function openUserProfile(userId: string) {
    if (window.location.hash !== '#profile') {
        window.history.pushState({ screen: 'profile' }, '', '#profile');
    }

    const modal = document.getElementById('modal-content')!;
    modal.classList.remove('overflow-y-auto', 'p-6');
    modal.classList.add('flex', 'flex-col', 'overflow-hidden', 'p-0');
    
    document.getElementById('modal-overlay')?.classList.remove('hidden');
    modal.innerHTML = `
        <div class="flex justify-between items-center p-6 pb-4 shrink-0 border-b border-gray-100 dark:border-gray-800">
            <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">Профиль</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto px-6 pt-4 custom-scrollbar flex flex-col items-center">
            <div class="w-28 h-28 rounded-full bg-gray-200 dark:bg-gray-700 mb-4 animate-pulse shrink-0 shadow-md"></div>
            <div class="w-32 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse shrink-0 mb-2"></div>
            <div class="w-20 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse shrink-0 mb-4"></div>
            <div class="w-full flex-1 flex justify-center items-center mt-8">
                <div class="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        </div>
    `;

    const { data: userToFind } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!userToFind) {
        modal.innerHTML = '<div class="p-6 text-center text-gray-500">Пользователь не найден</div>';
        return;
    }
    
    let isPremiumUser = userToFind.is_premium && (!userToFind.premium_until || new Date(userToFind.premium_until) > new Date());
    const premiumBadgeHtml = isPremiumUser ? `<div class="absolute bottom-0 right-0 translate-x-1.5 translate-y-1.5 bg-white dark:bg-gray-800 rounded-full p-1 shadow-sm border-2 border-white dark:border-gray-900 z-50 w-8 h-8 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : '';
    
    const avatarInnerHtml = userToFind.avatar_url ? `<img src="${userToFind.avatar_url}" class="w-full h-full object-cover rounded-full">` : `${(userToFind.display_name || userToFind.username || 'U')[0].toUpperCase()}`;
    const avatarHtml = `<div class="w-full h-full relative rounded-full flex items-center justify-center ${!userToFind.avatar_url ? 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-bold text-4xl' : ''}">${avatarInnerHtml}${premiumBadgeHtml}</div>`;
    
    let usernameHtml = '';
    if (userToFind.username) {
        usernameHtml = `<div class="text-sm text-blue-500 text-center select-all mt-1 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors" onclick="navigator.clipboard.writeText('@${userToFind.username}'); const old=this.innerHTML; this.innerHTML='✅ Скопировано'; setTimeout(()=>this.innerHTML=old, 2000);" title="Копировать ID">@${userToFind.username}</div>`;
    }

    let statusText = 'В сети';
    if (!userToFind.is_online && userToFind.last_seen) {
        statusText = 'Был(а) недавно';
    } else if (!userToFind.is_online) {
        statusText = '';
    }

    const bioHtml = userToFind.bio ? `
        <div class="px-6 py-4 flex items-center gap-4 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
            <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-800 dark:text-gray-200 select-all whitespace-pre-wrap">${userToFind.bio}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">О себе</div>
            </div>
        </div>
    ` : '';

    modal.innerHTML = `
        <div class="sticky top-0 z-10 p-4 pt-6 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800/50">
            <div class="flex items-start justify-between absolute top-4 left-4 right-4 z-20">
                <button onclick="window.history.back()" class="w-10 h-10 bg-white/50 dark:bg-gray-900/50 hover:bg-black/10 dark:hover:bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center transition-colors text-gray-800 dark:text-white">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
                </button>
            </div>
            
            <div class="flex flex-col items-center mt-2 relative">
                <div class="w-28 h-28 mb-4 relative cursor-pointer" onclick="if('${userToFind.avatar_url}') window.openLightbox('${userToFind.avatar_url}')">
                    ${avatarHtml}
                </div>
                <h3 class="text-2xl font-bold text-gray-800 dark:text-gray-100 text-center flex items-center justify-center gap-1">
                    <span class="select-all">${userToFind.display_name || userToFind.username}</span>
                </h3>
                ${usernameHtml}
                <div class="text-[13px] font-medium ${userToFind.is_online ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'} mt-1.5 text-center px-4 bg-gray-50 dark:bg-gray-800/50 rounded-full py-0.5 inline-block mx-auto">${statusText}</div>
            </div>
        </div>

        <div class="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 pb-6 hidden-scrollbar relative text-left">
            ${bioHtml}
            
            <div class="p-6">
                ${userToFind.id !== state.currentUser?.id ? `
                    <div class="flex flex-col gap-3">
                        <button onclick="startDirectChatById('${userToFind.id}')" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                            Перейти к чату
                        </button>
                        ${userToFind.username ? `<button onclick="if(window.sendVibToUserModal) { window.sendVibToUserModal('${userToFind.username}'); }" class="w-full bg-gradient-to-r from-indigo-500 to-purple-600 shadow-md hover:shadow-lg text-white font-medium py-3 px-4 rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                            <div class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-tr from-yellow-300 to-amber-500 border border-white/50 animate-pulse">
                                <svg class="w-3 h-3 text-yellow-900" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z" clip-rule="evenodd"></path></svg>
                            </div>
                            Отправить VIB
                        </button>` : ''}
                    </div>
                ` : `
                    <div class="text-center text-sm text-gray-500 dark:text-gray-400">Это ваш профиль</div>
                `}
            </div>
        </div>
    `;

    document.getElementById('modal-overlay')!.classList.remove('hidden');
    setTimeout(() => modal.classList.add('modal-active'), 50);
}
(window as any).openUserProfile = openUserProfile;
