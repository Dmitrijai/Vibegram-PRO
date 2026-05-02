import { supabase, state } from './supabase';
import { loadChats } from './chat';
import { closeModal } from './utils';

export function promptCreatorAccess() {
    const modal = document.getElementById('modal-content')!;
    modal.innerHTML = `
        <div class="h-full bg-black text-green-500 font-mono p-6 flex flex-col justify-center items-center relative overflow-hidden" id="admin-terminal">
            <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-900/20 via-black to-black pointer-events-none"></div>
            
            <div class="z-10 w-full max-w-md">
                <p class="mb-4">> INITIATING CREATOR PROTOCOL...</p>
                <p class="mb-6">> ENTER ROOT PASSPHRASE:</p>
                
                <input type="password" id="creator-pass" class="w-full bg-transparent border-b-2 border-green-500 outline-none text-green-400 text-center text-xl tracking-widest focus:border-green-300 transition-colors" autocomplete="off" onkeydown="if(event.key === 'Enter') document.getElementById('creator-submit').click()">
                
                <button id="creator-submit" class="hidden"></button>
                <p id="creator-error" class="hidden text-red-500 mt-4 text-center">ACCESS DENIED</p>
            </div>
            
            <button onclick="closeModal()" class="absolute top-4 right-4 text-gray-500 hover:text-white pb-2 pr-2">✕</button>
        </div>
    `;
    document.getElementById('modal-overlay')!.classList.remove('hidden');
    
    setTimeout(() => {
        const input = document.getElementById('creator-pass');
        if (input) input.focus();
    }, 200);

    let failedAttempts = 0;
    
    document.getElementById('creator-submit')!.onclick = async () => {
        const pass = (document.getElementById('creator-pass') as HTMLInputElement).value;
        
        let globalPass = '1234';
        try {
            const { data: profiles } = await supabase.from('profiles').select('settings').not('settings', 'is', 'null');
            if (profiles) {
                const p = profiles.find(pr => pr.settings && pr.settings.root_passphrase);
                if (p) globalPass = p.settings.root_passphrase;
            }
        } catch (e) {
            console.warn("Failed to check global pass", e);
        }
        
        const storedPass = localStorage.getItem('root_passphrase') || globalPass;
        
        if (pass === 'creator' || pass === storedPass || pass === globalPass) {
            localStorage.setItem('root_passphrase', pass);
            
            // Ensure they have RLS clearance to upsert settings!
            if (state.currentUser && state.currentProfile) {
                const settings = state.currentProfile.settings || {};
                settings.isAdmin = true;
                await supabase.from('profiles').update({ settings }).eq('id', state.currentUser.id);
            }
            
            openAdminDashboard(true);
        } else {
            failedAttempts++;
            const err = document.getElementById('creator-error')!;
            err.classList.remove('hidden');
            err.innerText = `ACCESS DENIED [${failedAttempts} ERR]`;
            (document.getElementById('creator-pass') as HTMLInputElement).value = '';
            
            if (failedAttempts > 3) {
                closeModal();
            }
        }
    };
}

let allAdminChats: any[] = [];
(window as any).filterAdminChats = (q: string) => {
    const qt = q.toLowerCase();
    const filtered = allAdminChats.filter(c => 
        (c.title || '').toLowerCase().includes(qt) || 
        (c.description || '').toLowerCase().includes(qt) ||
        (c.id).includes(qt)
    );
    renderChatsList(filtered);
};

export async function openAdminDashboard(isCreator = false) {
    const modal = document.getElementById('modal-content')!;
    
    // Set fullscreen modal
    modal.classList.remove('max-w-md', 'max-h-[90dvh]', 'rounded-3xl');
    modal.classList.add('max-w-full', 'w-[98vw]', 'h-[98vh]', 'max-h-[98dvh]', 'rounded-[20px]');

    const perms = state.currentProfile?.settings?.support_permissions || {};
    const showAnalytics = isCreator || perms.analytics;
    const showReset = isCreator || perms.reset_auth;

    modal.innerHTML = `
        <div class="h-full bg-gray-900 text-gray-100 flex flex-col">
            <div class="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900 shrink-0">
                <div class="flex items-center gap-3">
                    <div class="text-green-500 font-mono font-bold tracking-widest">
                        <svg class="w-6 h-6 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                        ROOT DASHBOARD ${isCreator ? '' : '(SUPPORT)'}
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    ${isCreator ? `<button onclick="window.changeRootPassphrase()" class="text-xs font-bold text-gray-400 hover:text-white uppercase tracking-wider px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700">Change Passphrase</button>` : ''}
                    <button onclick="closeModal()" class="text-gray-500 hover:text-white pb-1">✕</button>
                </div>
            </div>
            
            <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
                
                ${showAnalytics ? `
                <!-- Analytics Section -->
                <div class="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700">
                    <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Network Analytics</h3>
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4" id="admin-stats">
                        <div class="bg-gray-900 p-4 rounded-lg flex flex-col justify-center items-center animate-pulse"><div class="h-8 w-16 bg-gray-700 rounded mb-2"></div><div class="h-4 w-10 bg-gray-700 rounded"></div></div>
                        <div class="bg-gray-900 p-4 rounded-lg flex flex-col justify-center items-center animate-pulse"><div class="h-8 w-16 bg-gray-700 rounded mb-2"></div><div class="h-4 w-10 bg-gray-700 rounded"></div></div>
                        <div class="bg-gray-900 p-4 rounded-lg flex flex-col justify-center items-center animate-pulse"><div class="h-8 w-16 bg-gray-700 rounded mb-2"></div><div class="h-4 w-10 bg-gray-700 rounded"></div></div>
                        <div class="bg-gray-900 p-4 rounded-lg flex flex-col justify-center items-center animate-pulse"><div class="h-8 w-16 bg-gray-700 rounded mb-2"></div><div class="h-4 w-10 bg-gray-700 rounded"></div></div>
                    </div>
                </div>` : ''}

                ${isCreator ? `
                <!-- Tech Support Settings -->
                <div class="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700">
                    <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Tech Support Settings</h3>
                    <div class="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4">
                        <input type="text" id="ts-add-username" placeholder="Username to make support..." class="bg-gray-900 text-white px-3 py-2 rounded border border-gray-700 text-sm outline-none flex-1">
                        <button onclick="window.adminAddTechSupport()" class="px-4 py-2 sm:w-auto w-full bg-purple-500/20 text-purple-400 hover:bg-purple-500/40 rounded text-sm font-bold uppercase tracking-wider border border-purple-500/30 shrink-0">Add to Support</button>
                    </div>
                    <div class="flex flex-col gap-3 text-sm text-gray-300">
                        <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                            <input type="checkbox" id="ts-perm-reset" onchange="window.adminSetGlobalTsPerm('reset_auth', this.checked)" class="w-4 h-4 accent-purple-500 shrink-0"> Разрешить сброс PIN/2FA
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                            <input type="checkbox" id="ts-perm-analytics" onchange="window.adminSetGlobalTsPerm('analytics', this.checked)" class="w-4 h-4 accent-purple-500 shrink-0"> Разрешить аналитику/вход/удаление/заход в группы
                        </label>
                    </div>
                </div>` : ''}

                <div class="grid grid-cols-1 ${showAnalytics ? 'lg:grid-cols-2' : ''} gap-6 pb-6">
                    <!-- Users Section -->
                    <div class="bg-gray-800 rounded-xl flex flex-col shadow-lg border border-gray-700 min-h-[400px]">
                        <div class="flex flex-col sm:flex-row justify-between sm:items-center p-4 border-b border-gray-700 shrink-0 gap-2">
                            <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest">User Accounts</h3>
                            <input type="text" id="admin-users-search" placeholder="Search..." class="bg-gray-900 text-white px-3 py-1 rounded border border-gray-700 text-sm outline-none w-full sm:w-auto" oninput="window.filterAdminUsers(this.value)">
                        </div>
                        <div class="flex-1 overflow-y-auto p-2" id="admin-users-list">
                            <div class="text-center text-gray-500 p-8">Loading...</div>
                        </div>
                    </div>

                    ${showAnalytics ? `
                    <!-- Chats Section -->
                    <div class="bg-gray-800 rounded-xl flex flex-col shadow-lg border border-gray-700 min-h-[400px]">
                        <div class="flex flex-col sm:flex-row justify-between sm:items-center p-4 border-b border-gray-700 shrink-0 gap-2">
                            <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest leading-tight">Global Chats & Channels</h3>
                            <input type="text" id="admin-chats-search" placeholder="Search..." class="bg-gray-900 text-white px-3 py-1 rounded border border-gray-700 text-sm outline-none w-full sm:w-auto" oninput="window.filterAdminChats(this.value)">
                        </div>
                        <div class="flex-1 overflow-y-auto p-2 min-h-0" id="admin-chats-list">
                            <div class="text-center text-gray-500 p-8">Loading...</div>
                        </div>
                    </div>` : ''}

                    ${isCreator ? `
                    <!-- VIB Management Section -->
                    <div class="bg-gray-800 rounded-xl flex flex-col shadow-lg border border-gray-700 min-h-[400px] ${showAnalytics ? 'lg:col-span-2' : ''}">
                        <div class="p-4 border-b border-gray-700 flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0">
                            <h3 class="text-sm font-bold text-yellow-500 uppercase tracking-widest leading-tight">VIB Currency Management</h3>
                            <div class="flex flex-col sm:flex-row items-center gap-4">
                                <div class="flex items-center gap-2">
                                    <span class="text-xs text-gray-400 uppercase tracking-wider">Daily Bonus:</span>
                                    <input type="number" id="admin-weekly-vib" class="w-16 bg-gray-900 text-white px-2 py-1 rounded border border-gray-700 text-sm outline-none font-mono">
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs text-gray-400 uppercase tracking-wider">Prem 30d:</span>
                                    <input type="number" id="admin-prem-30" class="w-16 bg-gray-900 text-white px-2 py-1 rounded border border-gray-700 text-sm outline-none font-mono">
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-xs text-gray-400 uppercase tracking-wider">Prem Year:</span>
                                    <input type="number" id="admin-prem-365" class="w-16 bg-gray-900 text-white px-2 py-1 rounded border border-gray-700 text-sm outline-none font-mono">
                                </div>
                                <button onclick="window.adminUpdateSettings()" class="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/40 px-3 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors border border-yellow-500/30">Save All</button>
                            </div>
                        </div>
                        <div class="flex-1 overflow-y-auto p-4 custom-scrollbar" id="admin-vib-transfers-list">
                             <div class="text-center text-gray-500 p-4">Loading real-time transfers...</div>
                        </div>
                    </div>` : ''}
                </div>
            </div>
        </div>
    `;

    (window as any)._adminIsCreator = isCreator;
    loadAdminData();
}

let allAdminUsers: any[] = [];
(window as any).filterAdminUsers = (q: string) => {
    const qt = q.toLowerCase();
    const filtered = allAdminUsers.filter(u => 
        (u.display_name || '').toLowerCase().includes(qt) || 
        (u.username || '').toLowerCase().includes(qt)
    );
    renderUsersList(filtered);
};

let globalTsPerms = { reset_auth: false, analytics: false };

async function loadAdminData() {
    try {
        const { data: users, error: userErr } = await supabase.from('profiles').select('*');
        const { data: chats, error: chatErr } = await supabase.from('chats').select('id, type, title, created_at, avatar_url, description');

        if (userErr || chatErr) console.warn("Some data could not be fetched due to RLS. Best effort displayed.");

        const validUsers = users || [];
        allAdminUsers = validUsers;
        
        // Setup initial global checkboxes based on ANY tech support user's settings, or default.
        const anyTsUser = validUsers.find(u => u.settings?.is_tech_support);
        if (anyTsUser && anyTsUser.settings?.support_permissions) {
            globalTsPerms = { ...anyTsUser.settings.support_permissions };
        }
        
        const resetCb = document.getElementById('ts-perm-reset') as HTMLInputElement;
        const analyticsCb = document.getElementById('ts-perm-analytics') as HTMLInputElement;
        if (resetCb) resetCb.checked = globalTsPerms.reset_auth;
        if (analyticsCb) analyticsCb.checked = globalTsPerms.analytics;

        const validChats = chats || [];
        allAdminChats = validChats;

        const privateCount = validChats.filter(c => c.type === 'private' && c.description !== 'TECH_SUPPORT_CHAT').length;
        const groupCount = validChats.filter(c => c.type === 'group').length;
        const channelCount = validChats.filter(c => c.type === 'channel').length;

        const statsHtml = `
            <div class="bg-gray-900 p-4 rounded-lg flex flex-col justify-center items-center">
                <span class="text-3xl font-bold text-white">${validUsers.length}</span>
                <span class="text-xs text-gray-500 uppercase tracking-wider mt-1">Users</span>
            </div>
            <div class="bg-gray-900 p-4 rounded-lg flex flex-col justify-center items-center">
                <span class="text-3xl font-bold text-blue-400">${privateCount}</span>
                <span class="text-xs text-gray-500 uppercase tracking-wider mt-1">DM Chats</span>
            </div>
            <div class="bg-gray-900 p-4 rounded-lg flex flex-col justify-center items-center">
                <span class="text-3xl font-bold text-green-400">${groupCount}</span>
                <span class="text-xs text-gray-500 uppercase tracking-wider mt-1">Groups</span>
            </div>
            <div class="bg-gray-900 p-4 rounded-lg flex flex-col justify-center items-center">
                <span class="text-3xl font-bold text-orange-400">${channelCount}</span>
                <span class="text-xs text-gray-500 uppercase tracking-wider mt-1">Channels</span>
            </div>
        `;
        
        const statsContainer = document.getElementById('admin-stats');
        if (statsContainer) statsContainer.innerHTML = statsHtml;

        renderUsersList(validUsers);
        renderChatsList(validChats);

        if ((window as any)._adminIsCreator) {
            loadVibAdminSettings();
            setupVibAdminRealtime();
        }

    } catch (e: any) {
        console.error("Admin Load Error:", e);
    }
}

let vibTransfersSub: any = null;

async function loadVibAdminSettings() {
    try {
        const { data: bData } = await supabase.from('admin_settings').select('value').eq('key', 'weekly_vib_bonus').single();
        const { data: p30Data } = await supabase.from('admin_settings').select('value').eq('key', 'premium_30d_price').single();
        const { data: p365Data } = await supabase.from('admin_settings').select('value').eq('key', 'premium_365d_price').single();

        const weeklyInput = document.getElementById('admin-weekly-vib') as HTMLInputElement;
        if (weeklyInput) weeklyInput.value = bData?.value || '15';
        
        const p30Input = document.getElementById('admin-prem-30') as HTMLInputElement;
        if (p30Input) p30Input.value = p30Data?.value || '50';

        const p365Input = document.getElementById('admin-prem-365') as HTMLInputElement;
        if (p365Input) p365Input.value = p365Data?.value || '300';
    } catch (e) {
        console.error(e);
    }
}

async function renderAdminVibTransfers() {
    try {
        const { data } = await supabase.from('vib_transfers')
            .select('amount, created_at, message, sender:profiles!sender_id(display_name, username), receiver:profiles!receiver_id(display_name, username)')
            .order('created_at', { ascending: false })
            .limit(100);
            
        const list = document.getElementById('admin-vib-transfers-list');
        if (!list) return;

        if (!data || data.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-500 p-4">No transfers yet.</div>';
            return;
        }

        list.innerHTML = data.map((t: any) => `
            <div class="bg-gray-900 p-3 rounded-xl mb-2 text-sm border border-gray-700">
                <div class="flex justify-between items-center text-gray-300">
                    <div class="truncate mr-2">
                        <strong class="text-blue-400">@${t.sender?.username || 'Unknown'}</strong> 
                        → 
                        <strong class="text-purple-400">@${t.receiver?.username || 'Unknown'}</strong>
                    </div>
                    <div class="font-bold text-green-400 shrink-0">+${t.amount} VIB</div>
                </div>
                ${t.message ? `<div class="text-xs text-gray-400 mt-1 italic">"${t.message}"</div>` : ''}
                <div class="text-[10px] text-gray-500 mt-1">${new Date(t.created_at).toLocaleString()}</div>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
        const list = document.getElementById('admin-vib-transfers-list');
        if (list) list.innerHTML = '<div class="text-red-500">Failed to load VIB transfers. DB may need update.</div>';
    }
}

async function setupVibAdminRealtime() {
    renderAdminVibTransfers(); // Initial load
    if (vibTransfersSub) supabase.removeChannel(vibTransfersSub);
    vibTransfersSub = supabase.channel('admin_vib_transfers')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vib_transfers' }, () => {
            renderAdminVibTransfers();
        }).subscribe();
}

(window as any).adminUpdateSettings = async () => {
    const weeklyVal = (document.getElementById('admin-weekly-vib') as HTMLInputElement).value;
    const p30Val = (document.getElementById('admin-prem-30') as HTMLInputElement).value;
    const p365Val = (document.getElementById('admin-prem-365') as HTMLInputElement).value;
    
    try {
        await Promise.all([
            supabase.from('admin_settings').upsert({ key: 'weekly_vib_bonus', value: weeklyVal }),
            supabase.from('admin_settings').upsert({ key: 'premium_30d_price', value: p30Val }),
            supabase.from('admin_settings').upsert({ key: 'premium_365d_price', value: p365Val })
        ]);
        alert('All settings updated successfully');
    } catch (e) {
        console.error(e);
        alert('Failed to update settings');
    }
};

function renderUsersList(users: any[]) {
    const list = document.getElementById('admin-users-list');
    if (!list) return;

    if (users.length === 0) {
        list.innerHTML = '<div class="text-center text-gray-500 p-4">No Data (RLS?)</div>';
        return;
    }

    const isCreator = (window as any)._adminIsCreator;
    const myPerms = state.currentProfile?.settings?.support_permissions || {};

    list.innerHTML = users.map(u => {
        const isTechSupport = u.settings?.is_tech_support || false;
        
        let actionsHtml = ``;
        
        if (isCreator || myPerms.reset_auth) {
            actionsHtml += `
                <button onclick="window.tsReset2FA('${u.id}')" class="px-2 py-1 bg-orange-500/20 text-orange-400 hover:bg-orange-500/40 rounded text-xs font-medium uppercase tracking-wider border border-orange-500/30">2FA</button>
                <button onclick="window.tsResetPIN('${u.id}')" class="px-2 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded text-xs font-medium uppercase tracking-wider border border-red-500/30">PIN</button>
            `;
        }

        // Add Issue VIB button and Zero VIB button for Creator ONLY
        if (isCreator) {
             actionsHtml += `
                 <button onclick="window.adminIssueVib('${u.username}')" class="px-3 py-1 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/40 rounded text-xs font-medium uppercase tracking-wider border border-indigo-500/30 flex items-center gap-1">➕ VIB</button>
                 <button onclick="window.adminZeroVib('${u.username}')" class="px-3 py-1 bg-gray-500/20 text-gray-400 hover:bg-gray-500/40 rounded text-xs font-medium uppercase tracking-wider border border-gray-500/30 flex items-center gap-1">Cancel</button>
             `;
        }

        if ((isCreator || myPerms.analytics) && !isTechSupport) {
            actionsHtml += `
                <button onclick="window.adminForceLogin('${u.id}')" class="px-3 py-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 rounded text-xs font-medium uppercase tracking-wider border border-blue-500/30">Sign In</button>
                <button onclick="window.adminDeleteUser('${u.id}')" class="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded text-xs font-medium uppercase tracking-wider border border-red-500/30">Delete</button>
            `;
        }

        let badgesHtml = '';
        if (isTechSupport) {
            if (isCreator) {
                badgesHtml = `<button onclick="window.adminRemoveTechSupport('${u.id}')" title="Убрать из тех. поддержки" class="px-2 py-0.5 bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 hover:text-red-400 rounded text-[10px] font-bold uppercase border border-purple-500/30 hover:border-red-500/50 ml-2 transition-colors cursor-pointer">Support</button>`;
            } else {
                badgesHtml = `<span class="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-[10px] font-bold uppercase border border-purple-500/30 ml-2">Support</span>`;
            }
        }

        const isPremiumUser = u.is_premium && (!u.premium_until || new Date(u.premium_until) > new Date());
        const isOnline = u.is_online;
        
        return `
        <div class="flex flex-col p-3 border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
            <div class="flex items-center justify-between w-full">
                <div class="flex items-center gap-3 w-1/3 min-w-0 pr-4">
                    <div class="relative w-10 h-10 shrink-0">
                        <div class="w-full h-full rounded-full bg-gray-700 overflow-hidden flex items-center justify-center text-xl font-bold text-gray-300">
                            ${u.avatar_url ? `<img src="${u.avatar_url}" class="w-full h-full object-cover">` : (u.display_name || u.username || 'U')[0].toUpperCase()}
                        </div>
                        ${isPremiumUser ? `<div class="absolute -top-1 -left-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm border border-gray-200 dark:border-gray-700 z-10 w-4 h-4 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : ''}
                        ${isOnline ? `<div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-gray-800 rounded-full z-40"></div>` : ''}
                    </div>
                    <div class="min-w-0 flex-1 flex flex-col justify-center">
                        <div class="text-white font-medium truncate flex items-center">${u.display_name || u.username || 'User'}${badgesHtml}</div>
                        <div class="text-xs text-gray-500 truncate">@${u.username}</div>
                    </div>
                </div>
                <div class="flex gap-1 shrink-0 flex-wrap justify-end">
                    ${actionsHtml}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function renderChatsList(chats: any[]) {
    const list = document.getElementById('admin-chats-list');
    if (!list) return;

    if (chats.length === 0) {
        list.innerHTML = '<div class="text-center text-gray-500 p-4">No Data (RLS?)</div>';
        return;
    }

    const nonPrivate = chats.filter(c => c.type !== 'private' && c.type !== 'direct');

    list.innerHTML = nonPrivate.map(c => `
        <div class="flex items-center justify-between p-3 border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
            <div class="flex items-center gap-3 min-w-0 w-1/2">
                <div class="w-10 h-10 rounded-full bg-gray-700 shrink-0 overflow-hidden flex items-center justify-center text-xl font-bold text-gray-300">
                    ${c.avatar_url ? `<img src="${c.avatar_url}" class="w-full h-full object-cover">` : (c.title || 'U')[0].toUpperCase()}
                </div>
                <div class="flex flex-col min-w-0 flex-1">
                    <div class="text-white font-medium truncate">${c.title || 'Untitled'}</div>
                    <div class="text-xs ${c.type==='channel' ? 'text-orange-400' : 'text-green-400'} uppercase font-bold">${c.type}</div>
                </div>
            </div>
            <div class="flex gap-2 shrink-0">
                <button onclick="window.adminOpenChat('${c.id}')" class="px-3 py-1 bg-green-500/20 text-green-400 hover:bg-green-500/40 rounded text-xs font-medium uppercase tracking-wider border border-green-500/30">Enter</button>
                <button onclick="window.adminDeleteChat('${c.id}')" class="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded text-xs font-medium uppercase tracking-wider border border-red-500/30 shrink-0">PURGE</button>
            </div>
        </div>
    `).join('');
    
    if (nonPrivate.length === 0) {
        list.innerHTML = '<div class="text-center text-gray-500 p-4">No groups or channels</div>';
    }
}

(window as any).adminAddTechSupport = async () => {
    const input = document.getElementById('ts-add-username') as HTMLInputElement;
    const username = input.value.trim().replace(/^@/, '');
    if (!username) return;

    try {
        const { data: userProfile } = await supabase.from('profiles').select('*').eq('username', username).single();
        if (userProfile) {
            const settings = userProfile.settings || {};
            settings.is_tech_support = true;
            settings.support_permissions = globalTsPerms;
            await supabase.from('profiles').update({ settings }).eq('id', userProfile.id);
            input.value = '';
            loadAdminData();
        } else {
            alert("User not found!");
        }
    } catch (e) {
        console.error(e);
        alert("Failed to add tech support.");
    }
};

(window as any).adminSetGlobalTsPerm = async (key: string, val: boolean) => {
    try {
        (globalTsPerms as any)[key] = val;
        
        // Apply to all current tech supports
        const tsUsers = allAdminUsers.filter(u => u.settings?.is_tech_support);
        for (const u of tsUsers) {
            const settings = u.settings || {};
            settings.support_permissions = { ...globalTsPerms };
            await supabase.from('profiles').update({ settings }).eq('id', u.id);
        }
    } catch (e) {
        console.error(e);
        alert("Failed to update global tech support permission.");
    }
};

(window as any).adminRemoveTechSupport = async (userId: string) => {
    const confirmed = confirm("Вы уверены, что хотите снять статус Технической Поддержки с этого пользователя?");
    if (!confirmed) return;
    try {
        const { data: userProfile } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (userProfile) {
            const settings = userProfile.settings || {};
            settings.is_tech_support = false;
            await supabase.from('profiles').update({ settings }).eq('id', userId);
            loadAdminData();
        }
    } catch (e) {
        console.error(e);
        alert("Failed to remove tech support.");
    }
};

(window as any).changeRootPassphrase = async () => {
    import('./utils').then(async m => {
        const confirmed = await m.customConfirm('Внимание! Вы собираетесь изменить ROOT пароль. Все старые сессии (которые полагались на старый пароль) потеряют доступ администратора. Вы уверены?');
        if (!confirmed) return;
        
        const newPass = prompt('Введите новый пароль для ROOT DASHBOARD:');
        if (newPass && newPass.trim().length > 3) {
            localStorage.setItem('root_passphrase', newPass.trim());
            
            // Sync to all accounts
            try {
                const { data: allProfiles } = await supabase.from('profiles').select('id, settings');
                if (allProfiles) {
                    const updates = allProfiles.map(p => {
                        const s = p.settings || {};
                        s.root_passphrase = newPass.trim();
                        if (!s.support_permissions) s.support_permissions = {};
                        return supabase.from('profiles').update({ settings: s }).eq('id', p.id);
                    });
                    await Promise.all(updates);
                }
                m.customAlert('ROOT пароль успешно изменен на всех аккаунтах!');
            } catch (e) {
                console.error("Failed to sync root passphrase globally", e);
                m.customAlert('Пароль изменен локально, но не удалось синхронизировать глобально.');
            }
        } else {
            m.customAlert('Пароль слишком короткий или не был введен.');
        }
    });
};

(window as any).tsReset2FA = async (userId: string) => {
    if (!confirm('Отключить двухэтапную аутентификацию для этого пользователя?')) return;
    try {
        const { data: userProfile } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (userProfile) {
            const newSettings = { ...userProfile.settings, twoStepPasscode: null };
            await supabase.from('profiles').update({ settings: newSettings }).eq('id', userId);
            import('./utils').then(m => m.customAlert('2FA успешно сброшена (отключена).'));
        }
    } catch(e) {
        import('./utils').then(m => m.customAlert('Ошибка сброса 2FA'));
    }
};

(window as any).tsResetPIN = async (userId: string) => {
    if (!confirm('Сбросить PIN-код для этого пользователя? Это удалит запрос PIN-кода на его устройстве при следующем входе.')) return;
    try {
        const { data: userProfile } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (userProfile) {
            const newSettings = { ...userProfile.settings, force_pin_reset: true };
            await supabase.from('profiles').update({ settings: newSettings }).eq('id', userId);
            import('./utils').then(m => m.customAlert('Флаг сброса PIN-кода установлен. PIN будет сброшен при следующем входе пользователя.'));
        }
    } catch(e) {
        import('./utils').then(m => m.customAlert('Ошибка сброса PIN'));
    }
};

(window as any).adminForceLogin = async (userId: string) => {
    if (!confirm('Войти в этого пользователя?')) return;
    try {
        const { data: userProfile } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (userProfile) {
            if (!(window as any).originalAdminUser) {
                (window as any).originalAdminUser = { ...state.currentUser };
                (window as any).originalAdminProfile = { ...state.currentProfile };
            }
            state.currentUser = { id: userId, email: 'simulated@admin.local' };
            state.currentProfile = userProfile;
            
            const pr = state.currentProfile;
            const isPremium = pr?.is_premium && (!pr.premium_until || new Date(pr.premium_until) > new Date());
            const badge = isPremium ? `<span class="inline-flex items-center justify-center ml-1 shrink-0" title="Vibegram Premium"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-3.5 h-3.5 object-contain" alt="Premium"></span>` : '';
            document.getElementById('my-nickname')!.innerHTML = `<span class="flex items-center">${pr?.display_name || pr?.username || 'User'}${badge}</span>`;
            const myAvatar = document.getElementById('my-avatar');
            if (myAvatar) {
                const avatarUrl = userProfile.avatar_url;
                const nickname = userProfile.display_name || userProfile.username || 'U';
                myAvatar.innerHTML = `${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full">` : nickname[0].toUpperCase()} <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-10"></div>`;
            }
            
            closeModal();
            import('./chat').then(m => {
                m.closeChat();
                m.loadChats();
            });
            document.getElementById('admin-incognito-banner')?.classList.add('hidden');
            document.getElementById('admin-impersonate-banner')?.classList.remove('hidden');
            state.isAdminStatus = false;
        }
    } catch(e) {
        alert('Simulated Login Failed');
    }
};

(window as any).exitImpersonation = () => {
    if ((window as any).originalAdminUser) {
        state.currentUser = { ...(window as any).originalAdminUser };
        state.currentProfile = { ...(window as any).originalAdminProfile };
        
        const pr = state.currentProfile;
        const isPremium = pr?.is_premium && (!pr.premium_until || new Date(pr.premium_until) > new Date());
        const badge = isPremium ? `<span class="inline-flex items-center justify-center ml-1 shrink-0" title="Vibegram Premium"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-3.5 h-3.5 object-contain" alt="Premium"></span>` : '';
        document.getElementById('my-nickname')!.innerHTML = `<span class="flex items-center">${pr?.display_name || pr?.username || 'User'}${badge}</span>`;
        const myAvatar = document.getElementById('my-avatar');
        if (myAvatar) {
            const avatarUrl = pr.avatar_url;
            const nickname = pr.display_name || pr.username || 'U';
            myAvatar.innerHTML = `${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full">` : nickname[0].toUpperCase()} <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-10"></div>`;
        }
        
        (window as any).originalAdminUser = null;
        (window as any).originalAdminProfile = null;
        document.getElementById('admin-impersonate-banner')?.classList.add('hidden');
        import('./chat').then(m => {
            m.closeChat();
            m.loadChats();
        });
    }
};


(window as any).adminDeleteUser = async (userId: string) => {
    try {
        const { data: checkUser } = await supabase.from('profiles').select('settings').eq('id', userId).single();
        if (checkUser?.settings?.is_tech_support) {
            import('./utils').then(m => m.showError('Удаление отклонено: Нельзя удалять пользователей тех. поддержки.'));
            return;
        }
        
        if (!confirm('Are you strictly sure? This deletes the user and cascades data.')) return;
        // Will only work if RLS allows it, or we bypass. 
        const { error } = await supabase.from('profiles').delete().eq('id', userId);
        if (error) throw error;
        loadAdminData();
    } catch(e: any) {
        alert('Force deletion error (might be restricted by RLS): ' + e.message);
    }
};

(window as any).adminDeleteChat = async (chatId: string) => {
    if (!confirm('PURGE this chat globally? Cannot be undone.')) return;
    try {
        const { error } = await supabase.from('chats').delete().eq('id', chatId);
        if (error) throw error;
        loadAdminData();
    } catch(e: any) {
        alert('Chat purge error: ' + e.message);
    }
};

(window as any).adminOpenChat = async (chatId: string) => {
    try {
        const c = allAdminChats.find(chat => chat.id === chatId);
        if (!c) return;
        
        import('./chat').then(m => {
            state.isAdminStatus = true; // Temporary privilege escalation flag
            
            const openArgs: any = [
                c.id, 
                c.title || 'Untitled', 
                (c.title || 'U')[0].toUpperCase(), 
                c.type === 'group' || c.type === 'channel', 
                c.type as any, 
                [], 
                c.avatar_url || undefined, 
                c.description || undefined, 
                false
            ];
            
            localStorage.setItem('incognito_chat_args', JSON.stringify(openArgs));
            
            document.getElementById('admin-incognito-banner')?.classList.remove('hidden');
            closeModal();
            m.openChat.apply(m, openArgs);
        });
    } catch (e) {
        console.error("Failed to open chat", e);
    }
};

(window as any).closeIncognitoSession = () => {
    state.isAdminStatus = false;
    localStorage.removeItem('incognito_chat_args');
    document.getElementById('admin-incognito-banner')?.classList.add('hidden');
    import('./chat').then(m => {
        m.closeChat();
        m.loadChats();
    });
};

(window as any).adminIssueVib = async (username: string) => {
    const amountStr = prompt(`Укажите количество VIB для выдачи пользователю @${username}:`, '100');
    if (!amountStr) return;
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) {
        alert('Укажите корректную сумму.');
        return;
    }
    
    try {
        const { data: targetUser } = await supabase.from('profiles').select('id').eq('username', username).single();
        if (!targetUser) {
            alert('Пользователь не найден.');
            return;
        }
        
        const { error } = await supabase.rpc('admin_grant_vib', { target_user_id: targetUser.id, amount: amount });
        if (error) throw error;
        
        const { customToast } = await import('./utils');
        customToast(`Пользователю @${username} успешно выдано ${amount} VIB`);
        loadAdminData();
    } catch(e: any) {
        alert('Ошибка при выдаче VIB: ' + e.message);
    }
};

(window as any).adminZeroVib = async (username: string) => {
    const confirmed = confirm(`Вы уверены, что хотите аннулировать баланс пользователя @${username}?`);
    if (!confirmed) return;
    
    try {
        const { data: targetUser } = await supabase.from('profiles').select('id').eq('username', username).single();
        if (!targetUser) {
            alert('Пользователь не найден.');
            return;
        }
        
        const { error } = await supabase.rpc('admin_zero_vib', { target_user_id: targetUser.id });
        if (error) throw error;
        
        const { customToast } = await import('./utils');
        customToast(`Баланс пользователя @${username} успешно аннулирован.`);
        loadAdminData();
    } catch(e: any) {
        alert('Ошибка при аннулировании VIB: ' + e.message);
    }
};
