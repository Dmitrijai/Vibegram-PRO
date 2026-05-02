import { supabase, state } from './supabase';
import { customToast } from './utils';

let editingPollId: string | null = null;
let currentPollId: string | null = null;

export function openEditPollModal(messageId: string, pollData: any) {
    editingPollId = messageId;
    currentPollId = pollData.pollId || null;
    document.getElementById('create-poll-modal')?.classList.remove('hidden');
    
    // Populate form
    (document.getElementById('poll-question') as HTMLInputElement).value = pollData.question;
    const container = document.getElementById('poll-options-container');
    if (container) {
        container.innerHTML = '';
        pollData.options.forEach((opt: any, index: number) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'poll-option-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent';
            input.placeholder = `Вариант ${index + 1}`;
            input.value = opt.text;
            input.dataset.id = opt.id;
            // Store votes as JSON to preserve them
            input.dataset.votes = JSON.stringify(opt.votes || []);
            container.appendChild(input);
        });
    }
    (document.getElementById('poll-anonymous') as HTMLInputElement).checked = pollData.anonymous;
    (document.getElementById('poll-multiple') as HTMLInputElement).checked = pollData.multiple;
    
    const btn = document.getElementById('submit-poll-btn');
    if (btn) {
        btn.textContent = 'Сохранить';
    }
    
    // Close attach menu if open
    document.getElementById('attach-menu')?.classList.add('hidden');
}

export function openCreatePollModal() {
    if (!state.activeChatId) return;
    editingPollId = null;
    currentPollId = null;
    document.getElementById('create-poll-modal')?.classList.remove('hidden');
    
    // Reset form
    (document.getElementById('poll-question') as HTMLInputElement).value = '';
    const container = document.getElementById('poll-options-container');
    if (container) {
        container.innerHTML = `
            <input type="text" class="poll-option-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Вариант 1">
            <input type="text" class="poll-option-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Вариант 2">
        `;
    }
    (document.getElementById('poll-anonymous') as HTMLInputElement).checked = true;
    (document.getElementById('poll-multiple') as HTMLInputElement).checked = false;
    
    const btn = document.getElementById('submit-poll-btn');
    if (btn) {
        btn.textContent = 'Создать';
    }
    
    // Close attach menu if open
    document.getElementById('attach-menu')?.classList.add('hidden');
}

export function closeCreatePollModal() {
    document.getElementById('create-poll-modal')?.classList.add('hidden');
}

export function addPollOption() {
    const container = document.getElementById('poll-options-container');
    if (!container) return;
    
    const inputs = container.querySelectorAll('.poll-option-input');
    if (inputs.length >= 10) {
        customToast('Максимум 10 вариантов');
        return;
    }
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'poll-option-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent';
    input.placeholder = `Вариант ${inputs.length + 1}`;
    
    container.appendChild(input);
}

export async function createPoll() {
    const question = (document.getElementById('poll-question') as HTMLInputElement).value.trim();
    if (!question) {
        customToast('Введите вопрос');
        return;
    }
    
    const optionInputs = document.querySelectorAll('.poll-option-input') as NodeListOf<HTMLInputElement>;
    const options = Array.from(optionInputs)
        .map(input => input.value.trim())
        .filter(val => val.length > 0);
        
    if (options.length < 2) {
        customToast('Нужно минимум 2 варианта ответа');
        return;
    }
    
    const isAnonymous = (document.getElementById('poll-anonymous') as HTMLInputElement).checked;
    const isMultiple = (document.getElementById('poll-multiple') as HTMLInputElement).checked;
    
    const pollId = currentPollId || crypto.randomUUID();
    const pollData = {
        pollId,
        question,
        options: Array.from(optionInputs).map((input, i) => {
            const text = input.value.trim();
            if (!text) return null;
            
            const id = input.dataset.id || i.toString();
            const votes = input.dataset.votes ? JSON.parse(input.dataset.votes) : [];
            return { id, text, votes };
        }).filter(Boolean),
        anonymous: isAnonymous,
        multiple: isMultiple
    };
    
    try {
        if (editingPollId) {
            // Update the original message
            const { error } = await supabase.from('messages').update({
                content: question,
                media: [pollData]
            }).eq('id', editingPollId).eq('sender_id', state.currentUser.id);
            
            if (error) throw error;
            
            // Sync all other messages with this pollId
            if (pollId) {
                const { data: allPolls } = await supabase.from('messages').select('id, media').eq('message_type', 'poll');
                if (allPolls) {
                    for (const p of allPolls) {
                        if (p.id !== editingPollId && p.media && p.media[0] && p.media[0].pollId === pollId) {
                            await supabase.from('messages').update({ content: question, media: [pollData] }).eq('id', p.id);
                        }
                    }
                }
            }
        } else {
            const { error } = await supabase.from('messages').insert({
                chat_id: state.activeChatId,
                sender_id: state.currentUser.id,
                content: question,
                media: [pollData],
                message_type: 'poll'
            });
            if (error) throw error;
        }
        
        closeCreatePollModal();
    } catch (err: any) {
        console.error('Error saving poll:', err);
        customToast('Ошибка при сохранении опроса');
    }
}

export async function showPollVoters(messageId: string) {
    try {
        const { data: msg, error: fetchError } = await supabase
            .from('messages')
            .select('media')
            .eq('id', messageId)
            .single();
            
        if (fetchError || !msg) throw fetchError;
        
        const media = msg.media;
        if (!media || !media[0] || !media[0].options) return;
        
        const pollData = media[0];
        if (pollData.anonymous) {
            customToast('Это анонимный опрос');
            return;
        }
        
        // Collect all unique user IDs
        const userIds = new Set<string>();
        pollData.options.forEach((opt: any) => {
            opt.votes.forEach((id: string) => userIds.add(id));
        });
        
        if (userIds.size === 0) {
            customToast('Пока нет голосов');
            return;
        }
        
        // Fetch profiles
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', Array.from(userIds));
            
        if (profilesError) throw profilesError;
        
        const profileMap = new Map(profiles?.map(p => [p.id, p]));
        
        // Build HTML
        let html = '';
        pollData.options.forEach((opt: any) => {
            if (opt.votes.length === 0) return;
            
            html += `
                <div class="mb-4">
                    <div class="text-sm font-bold text-gray-800 dark:text-gray-200 mb-2 border-b border-gray-100 dark:border-gray-700 pb-1">
                        ${opt.text} <span class="text-gray-500 font-normal ml-1">${opt.votes.length}</span>
                    </div>
                    <div class="space-y-2 pl-2">
            `;
            
            opt.votes.forEach((userId: string) => {
                const profile = profileMap.get(userId);
                if (!profile) return;
                
                const name = profile.display_name || profile.username || 'User';
                const avatar = profile.avatar_url 
                    ? `<img src="${profile.avatar_url}" class="w-6 h-6 rounded-full object-cover">`
                    : `<div class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold">${name.charAt(0).toUpperCase()}</div>`;
                    
                html += `
                    <div class="flex items-center gap-2">
                        ${avatar}
                        <span class="text-sm text-gray-700 dark:text-gray-300">${name}</span>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });
        
        const modal = document.getElementById('poll-voters-modal');
        const content = document.getElementById('poll-voters-content');
        if (modal && content) {
            content.innerHTML = html;
            modal.classList.remove('hidden');
        }
        
    } catch (err) {
        console.error('Error fetching voters:', err);
        customToast('Ошибка при загрузке проголосовавших');
    }
}

export function closePollVotersModal() {
    document.getElementById('poll-voters-modal')?.classList.add('hidden');
}

export async function votePoll(messageId: string, optionId: string) {
    if (state.isAdminStatus) return;
    if (!state.currentUser) return;
    
    try {
        // Fetch current message
        const { data: msg, error: fetchError } = await supabase
            .from('messages')
            .select('media')
            .eq('id', messageId)
            .single();
            
        if (fetchError || !msg) throw fetchError;
        
        const media = msg.media;
        if (!media || !media[0] || !media[0].options) return;
        
        const pollData = media[0];
        const userId = state.currentUser.id;
        
        // Check if user already voted
        let hasVoted = false;
        for (const opt of pollData.options) {
            if (opt.votes.includes(userId)) {
                hasVoted = true;
                break;
            }
        }
        
        if (hasVoted && !pollData.multiple) {
            // Remove previous vote
            for (const opt of pollData.options) {
                opt.votes = opt.votes.filter((id: string) => id !== userId);
            }
        }
        
        // Add new vote
        const targetOption = pollData.options.find((opt: any) => opt.id === optionId);
        if (targetOption) {
            if (targetOption.votes.includes(userId)) {
                // Toggle off if already voted
                targetOption.votes = targetOption.votes.filter((id: string) => id !== userId);
            } else {
                targetOption.votes.push(userId);
            }
        }
        
        const { error: updateError } = await supabase
            .from('messages')
            .update({ media: [pollData] })
            .eq('id', messageId);
            
        if (updateError) throw updateError;
        
        // Sync all other messages with this pollId
        if (pollData.pollId) {
            const { data: allPolls } = await supabase.from('messages').select('id, media').eq('message_type', 'poll');
            if (allPolls) {
                for (const p of allPolls) {
                    if (p.id !== messageId && p.media && p.media[0] && p.media[0].pollId === pollData.pollId) {
                        await supabase.from('messages').update({ media: [pollData] }).eq('id', p.id);
                    }
                }
            }
        }
        
    } catch (err) {
        console.error('Error voting:', err);
        customToast('Ошибка при голосовании');
    }
}
