import { supabase, state } from './supabase';
import { loadChats, openChat } from './chat';

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
                const title = channel.title;
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors min-w-0';
                const avatarHtml = channel.avatar_url ? `<img src="${channel.avatar_url}" class="w-full h-full object-cover rounded-full">` : `<div class="w-full h-full flex justify-center items-center">${title[0].toUpperCase()}</div>`;
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
                const nickname = u.display_name || u.username;
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors min-w-0';
                const avatarHtml = u.avatar_url ? `<img src="${u.avatar_url}" class="w-full h-full object-cover rounded-full">` : `<div class="w-full h-full flex justify-center items-center">${nickname[0].toUpperCase()}</div>`;
                const isPremiumUser = u.is_premium && (!u.premium_until || new Date(u.premium_until) > new Date());
                const premiumBadgeHtml = isPremiumUser ? `<div class="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm border border-gray-200 dark:border-gray-700 z-50 w-4 h-4 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : '';
                let usernameTag = u.username ? `<span class="text-xs text-gray-500 truncate block">@${u.username}</span>` : '';
                div.innerHTML = `<div class="w-10 h-10 shrink-0 relative"><div class="w-full h-full bg-blue-500 text-white rounded-full flex items-center justify-center font-bold overflow-hidden">${avatarHtml}</div>${premiumBadgeHtml}</div><div class="flex-1 min-w-0"><span class="font-semibold text-gray-800 dark:text-gray-100 truncate block">${nickname}</span>${usernameTag}</div>`;
                div.onclick = () => { resultsBox.classList.add('hidden'); (document.getElementById('search-input') as HTMLInputElement).value = ''; startChatWithUser(u); };
                resultsBox.appendChild(div);
            });
            groups?.forEach(g => {
                const title = g.title;
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors min-w-0';
                const avatarHtml = g.avatar_url ? `<img src="${g.avatar_url}" class="w-full h-full object-cover rounded-full">` : `<div class="w-full h-full flex justify-center items-center">${title[0].toUpperCase()}</div>`;
                let usernameTag = g.username ? ` • @${g.username}` : '';
                div.innerHTML = `<div class="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold overflow-hidden shrink-0">${avatarHtml}</div><div class="flex-1 min-w-0"><span class="font-semibold text-gray-800 dark:text-gray-100 truncate block">${title}</span><span class="text-xs text-gray-500 truncate block">Группа${usernameTag}</span></div>`;
                div.onclick = () => { resultsBox.classList.add('hidden'); (document.getElementById('search-input') as HTMLInputElement).value = ''; joinGroup(g); };
                resultsBox.appendChild(div);
            });
            channels?.forEach(c => {
                const title = c.title;
                const div = document.createElement('div');
                div.className = 'p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 transition-colors min-w-0';
                const avatarHtml = c.avatar_url ? `<img src="${c.avatar_url}" class="w-full h-full object-cover rounded-full">` : `<div class="w-full h-full flex justify-center items-center">${title[0].toUpperCase()}</div>`;
                let usernameTag = c.username ? ` • @${c.username}` : '';
                div.innerHTML = `<div class="w-10 h-10 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold overflow-hidden shrink-0">${avatarHtml}</div><div class="flex-1 min-w-0"><span class="font-semibold text-gray-800 dark:text-gray-100 truncate block">${title}</span><span class="text-xs text-gray-500 truncate block">Канал${usernameTag}</span></div>`;
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

    if (isSelf) {
        const { data: myChats } = await supabase.from('chat_members').select('chat_id').eq('user_id', state.currentUser.id);
        const myChatIds = myChats?.map(c => c.chat_id) || [];
        if (myChatIds.length > 0) {
            const { data: allMembers } = await supabase.from('chat_members').select('chat_id').in('chat_id', myChatIds);
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
    await loadChats();
    openChat(chatId, isSelf ? 'Избранное' : (userToFind.display_name || userToFind.username), (userToFind.display_name || userToFind.username)[0].toUpperCase(), false, 'private', [{user_id: userToFind.id, profiles: userToFind}], userToFind.avatar_url);
}

export async function startDirectChatById(userId: string) {
    const { data: userToFind } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (userToFind) {
        import('./utils').then(m => m.closeModal());
        startChatWithUser(userToFind);
    }
}
