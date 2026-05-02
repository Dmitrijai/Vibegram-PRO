import { supabase, state } from './supabase';
import { closeModal } from './utils';
import { loadChats } from './chat';
import { logout } from './auth';

let bonusTimerInterval: any = null;

export function openSettings(modeOrSkip: 'full' | 'profile' | boolean = 'full', skipPushStateArg = false) {
    let mode = 'full';
    let skipPushState = false;
    
    if (typeof modeOrSkip === 'boolean') {
        skipPushState = modeOrSkip;
    } else {
        mode = modeOrSkip;
        skipPushState = skipPushStateArg;
    }

    if (!skipPushState && window.location.hash !== '#settings') {
        window.history.pushState({ screen: 'settings' }, '', '#settings');
    }
    const modal = document.getElementById('modal-content')!;
    const nickname = state.currentProfile?.display_name || state.currentProfile?.username || 'User';
    const avatarUrl = state.currentProfile?.avatar_url || '';
    const bio = state.currentProfile?.bio || '';
    const settings = state.currentProfile?.settings || { notifications: true, privacy: 'everyone', theme: 'light', textSize: 15, chatBg: '#ffffff' };
    const isDark = document.documentElement.classList.contains('dark');

    const isMyPremium = state.currentProfile?.is_premium && (!state.currentProfile.premium_until || new Date(state.currentProfile.premium_until) > new Date());
    
    modal.innerHTML = `
        <div class="p-6 overflow-y-auto custom-scrollbar flex-1">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Настройки</h3>
                <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors">✕</button>
            </div>
            
            <div class="flex flex-col items-center mb-6 relative group">
                <div class="w-28 h-28 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 flex items-center justify-center text-white text-4xl font-bold shadow-lg overflow-hidden relative cursor-pointer" onclick="document.getElementById('avatar-upload').click()">
                    ${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover">` : nickname[0].toUpperCase()}
                    <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    </div>
                </div>
                ${isMyPremium ? `<div class="absolute top-[80px] ml-20 bg-white dark:bg-gray-800 text-white w-8 h-8 rounded-full flex justify-center items-center font-bold shadow-lg border-2 border-white dark:border-gray-900" title="Premium"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-5 h-5 object-contain" alt="Premium"></div>` : ''}
                <input type="file" id="avatar-upload" accept="image/*" class="hidden" onchange="uploadAvatar(event)">
                <div class="text-sm text-gray-500 dark:text-gray-400 mt-2 font-medium">Изменить фото</div>
                <div class="text-xs text-blue-500 dark:text-blue-400 mt-2 font-medium cursor-pointer hover:text-blue-600 dark:hover:text-blue-300 transition-colors select-all" onclick="navigator.clipboard.writeText('@${state.currentProfile?.username || ''}'); const old=this.innerHTML; this.innerHTML='✅ Скопировано'; setTimeout(()=>this.innerHTML=old, 2000);" title="Копировать ID">@${state.currentProfile?.username || ''}</div>
                ${state.currentUser?.email ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-2 font-medium bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">${state.currentUser.email}</div>` : ''}
                ${settings.is_tech_support ? '<div class="mt-2 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[10px] font-bold uppercase tracking-wider rounded-full border border-purple-200 dark:border-purple-800/30 inline-block">Техническая поддержка</div>' : ''}
            </div>

        <div class="space-y-3 mb-6 mt-4">
            <details class="group bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 open:shadow-sm transition-all ${mode === 'profile' ? 'hidden' : ''}">
                <summary class="flex justify-between items-center p-4 cursor-pointer select-none font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center text-yellow-600"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
                        Финансы и подписки
                    </div>
                    <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </summary>
                <div class="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/80 p-4">
                    <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[20px] p-5 sm:p-6 text-white shadow-xl relative overflow-hidden">
                        <div class="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <div class="text-xs sm:text-sm font-medium text-white/80 uppercase tracking-widest mb-1">Ваш баланс</div>
                                <div class="text-2xl sm:text-3xl font-bold font-mono flex items-center">
                                    <div class="inline-flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 rounded-full bg-gradient-to-tr from-yellow-300 to-amber-500 border-2 border-white/50 shadow-[0_0_15px_rgba(251,191,36,0.5)] animate-[pulse_2s_ease-in-out_infinite] align-middle shrink-0">
                                        <svg class="w-3.5 h-3.5 sm:w-5 sm:h-5 text-yellow-900" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z" clip-rule="evenodd"></path></svg>
                                    </div>
                                    <span id="my-vib-balance-display" class="truncate max-w-[120px] sm:max-w-none">${state.currentProfile?.vib_balance || 0}</span> <span class="text-lg sm:text-xl ml-1.5 sm:ml-2 text-white/90">VIB</span>
                                </div>
                            </div>
                            <button onclick="window.sendVibModal()" class="w-full sm:w-auto bg-white/20 hover:bg-white/30 backdrop-blur border border-white/20 transition-colors px-4 py-2 sm:py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                                Отправить
                            </button>
                        </div>
                        
                        <!-- Daily Bonus Progress -->
                        <div class="mt-4 sm:mt-6 pt-4 border-t border-white/20 relative z-10" id="daily-bonus-container">
                            <div class="flex justify-between items-center mb-1.5">
                                <span class="text-xs sm:text-sm font-semibold text-white/90">Ежедневный бонус</span>
                                <span class="text-xs sm:text-sm font-bold text-white/90 font-mono" id="bonus-timer-display">--:--</span>
                            </div>
                            <div class="w-full bg-black/20 rounded-full h-2.5 overflow-hidden shadow-inner">
                                <div class="bg-gradient-to-r from-yellow-300 to-yellow-500 h-full rounded-full transition-all duration-1000 ease-linear shadow-sm" id="bonus-progress-bar" style="width: 0%"></div>
                            </div>
                            <div class="text-[10px] sm:text-xs text-white/70 mt-1.5 flex justify-between tracking-wide" id="bonus-streak-display">
                                В сети: 0 дней
                            </div>
                        </div>

                        <div class="mt-4 sm:mt-6 pt-4 border-t border-white/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-2 relative z-10">
                            <div class="w-full sm:w-auto">
                                ${isMyPremium ? 
                                    `<div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center p-1.5 shrink-0"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>
                                        <div class="min-w-0 flex-1">
                                            <div class="font-bold text-yellow-300 tracking-wide text-xs sm:text-sm truncate">VIBEGRAM PREMIUM</div>
                                            <div class="text-[10px] sm:text-xs text-white/70 truncate">Активно до ${state.currentProfile.premium_until ? new Date(state.currentProfile.premium_until).toLocaleDateString() : '∞'}</div>
                                        </div>
                                    </div>` 
                                    : 
                                    `<div class="text-xs sm:text-sm font-medium text-white/90">Получите VIBEGRAM PREMIUM</div>`
                                }
                            </div>
                            ${!isMyPremium ? `<button onclick="window.buyPremiumModal()" class="w-full sm:w-auto bg-gradient-to-r from-yellow-400 to-orange-500 text-yellow-900 px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 transition-all hover:-translate-y-0.5 whitespace-nowrap">Купить</button>` : ''}
                        </div>
                    </div>
                    
                    <button onclick="window.openVibHistory()" class="w-full text-left mt-3 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border border-gray-200 dark:border-gray-600 flex justify-between items-center text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                        <span class="flex items-center gap-2 text-gray-800 dark:text-gray-100"><svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> История переводов VIB</span>
                        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                </div>
            </details>

            <details class="group bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 open:shadow-sm transition-all ${mode === 'profile' ? 'hidden' : ''}">
                <summary class="flex justify-between items-center p-4 cursor-pointer select-none font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-pink-100 dark:bg-pink-900/50 flex items-center justify-center text-pink-500"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg></div>
                        Инструменты
                    </div>
                    <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </summary>
                <div class="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/80 p-2 space-y-1">
                    <button onclick="import('./utils').then(m => m.closeModal()); setTimeout(() => { window.history.replaceState({ screen: 'create' }, '', '#create-channel'); window.openCreateChannel(true); }, 150);" class="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-3 text-gray-700 dark:text-gray-200">
                        <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"></path></svg>
                        Создать канал
                    </button>
                    <button onclick="import('./utils').then(m => m.closeModal()); setTimeout(() => { window.history.replaceState({ screen: 'create' }, '', '#create-group'); window.openCreateGroup(true); }, 150);" class="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-3 text-gray-700 dark:text-gray-200">
                        <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        Создать группу
                    </button>
                    <button onclick="import('./utils').then(m => m.closeModal()); setTimeout(() => { window.history.replaceState({ type: 'shorts' }, '', '#shorts'); window.openShorts(undefined, undefined, true); }, 150);" class="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-3 text-gray-700 dark:text-gray-200">
                        <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Shorts
                    </button>
                    <button onclick="import('./utils').then(m => m.closeModal()); setTimeout(() => { window.history.replaceState({}, '', '#miniapps'); window.openMiniAppsCatalog(true); }, 150);" class="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-3 text-gray-700 dark:text-gray-200">
                        <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
                        Мини-приложения
                    </button>
                </div>
            </details>
            <details class="group bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 open:shadow-sm transition-all">
                <summary class="flex justify-between items-center p-4 cursor-pointer select-none font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-500"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></div>
                        Профиль
                    </div>
                    <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </summary>
                <div class="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/80 p-0 text-center">
                    <input type="text" id="settings-name" value="${nickname}" placeholder="Имя" class="w-full p-3.5 bg-transparent border-b border-gray-200 dark:border-gray-700 outline-none font-medium text-gray-800 dark:text-gray-100" onchange="saveSettings()">
                    <textarea id="settings-bio" placeholder="О себе" class="w-full p-3.5 bg-transparent outline-none font-medium text-gray-800 dark:text-gray-100 resize-none h-20" onchange="saveSettings()">${bio}</textarea>
                </div>
            </details>
            
            <details class="group bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 open:shadow-sm transition-all">
                <summary class="flex justify-between items-center p-4 cursor-pointer select-none font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-500"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg></div>
                        Настройки чатов
                    </div>
                    <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </summary>
                <div class="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/80 p-2 space-y-1">
                    <div class="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 border-dashed">
                        <div class="flex items-center gap-3">
                            <span class="font-medium text-gray-700 dark:text-gray-200">Темная тема</span>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="settings-theme" class="sr-only peer" ${isDark ? 'checked' : ''} onchange="document.documentElement.classList.toggle('dark', this.checked); saveSettings()">
                            <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                        </label>
                    </div>
                    <div class="flex flex-col p-3 border-b border-gray-200 dark:border-gray-700 border-dashed">
                        <span class="font-medium text-gray-700 dark:text-gray-200 mb-2">Фон чата</span>
                        <div class="flex gap-3 overflow-x-auto p-1 py-3 font-sans custom-scrollbar scroll-smooth">
                            ${[
                                { id: 'default', class: 'chat-bg', isPremium: false },
                                { id: 'bg-anim-1', class: 'bg-anim-1', isPremium: false },
                                { id: 'bg-anim-2', class: 'bg-anim-2', isPremium: false },
                                { id: 'bg-anim-3', class: 'bg-anim-3', isPremium: false },
                                { id: 'bg-anim-4', class: 'bg-anim-4', isPremium: false },
                                { id: 'bg-anim-5', class: 'bg-anim-5', isPremium: false },
                                { id: 'bg-anim-6', class: 'bg-anim-6', isPremium: false },
                                { id: 'bg-anim-7', class: 'bg-anim-7', isPremium: false },
                                { id: 'bg-pattern-dots', class: 'bg-pattern-dots', isPremium: false },
                                { id: 'bg-premium-1', class: 'bg-premium-1', isPremium: true },
                                { id: 'bg-premium-2', class: 'bg-premium-2', isPremium: true },
                                { id: 'bg-premium-3', class: 'bg-premium-3', isPremium: true }
                            ].map(bg => `
                                <div onclick="if(${bg.isPremium} && !${isMyPremium}) { window.buyPremiumModal(); return; } document.getElementById('settings-chat-bg').value = '${bg.id}'; document.querySelectorAll('.bg-preview').forEach(el => el.classList.remove('ring-2', 'ring-inset', 'ring-blue-500')); this.classList.add('ring-2', 'ring-inset', 'ring-blue-500'); saveSettings();" 
                                     class="relative bg-preview shrink-0 w-14 h-14 rounded-xl cursor-pointer ${bg.class} ${settings.chatBg === bg.id || (!settings.chatBg && bg.id === 'default') ? 'ring-2 ring-inset ring-blue-500' : ''} shadow-sm border border-gray-200 dark:border-gray-700 flex items-center justify-center transition-transform active:scale-95">
                                     ${bg.isPremium ? '<img src="./image/Google-Gemini-Logo-Transparent.png" class="w-5 h-5 absolute -top-2 -right-2 bg-white dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 p-0.5 shadow-sm" alt="Premium">' : ''}
                                </div>
                            `).join('')}
                        </div>
                        <input type="hidden" id="settings-chat-bg" value="${settings.chatBg || 'default'}">
                    </div>
                    ${isMyPremium ? `
                    <div class="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 border-dashed">
                        <div class="flex flex-col">
                            <span class="font-medium text-gray-700 dark:text-gray-200">Цена сообщения</span>
                            <span class="text-[10px] text-gray-500 uppercase tracking-tighter">Сколько VIB платят за сообщение вам</span>
                        </div>
                        <div class="flex items-center gap-2 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-1 rounded-lg">
                            <input type="number" id="settings-paid-message-price" value="${settings.paid_message_price || 0}" min="0" class="w-16 bg-transparent text-center font-mono outline-none dark:text-white" onchange="saveSettings()">
                            <span class="text-[10px] font-bold text-yellow-500 mr-1">VIB</span>
                        </div>
                    </div>
                    ` : ''}
                    <div class="p-3">
                        <div class="flex justify-between items-center mb-2">
                            <span class="font-medium text-gray-700 dark:text-gray-200">Размер текста</span>
                            <span class="text-sm text-gray-500" id="text-size-val">${settings.textSize || 15}px</span>
                        </div>
                        <input type="range" id="settings-text-size" min="12" max="24" value="${settings.textSize || 15}" class="w-full accent-blue-500" oninput="document.getElementById('text-size-val').innerText = this.value + 'px'" onchange="saveSettings()">
                    </div>
                </div>
            </details>

            <details class="group bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 open:shadow-sm transition-all ${mode === 'profile' ? 'hidden' : ''}">
                <summary class="flex justify-between items-center p-4 cursor-pointer select-none font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-500"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg></div>
                        Конфиденциальность 
                    </div>
                    <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </summary>
                <div class="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/80 p-2 space-y-1">
                    <div class="flex flex-col p-3 border-b border-gray-200 dark:border-gray-700 border-dashed">
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-medium text-gray-700 dark:text-gray-200">Двухэтапный пароль</span>
                        </div>
                        <p class="text-xs text-gray-500 mb-2">Запрашивается при входе через Google</p>
                        <button onclick="promptForPasswordSetting('2fa')" class="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 p-2 rounded-lg outline-none transition-colors text-left uppercase text-[11px] font-bold tracking-wider text-center">
                            ${settings.twoStepPasscode ? 'Сменить пароль' : 'Установить пароль'}
                        </button>
                    </div>
                    <div class="flex flex-col p-3 border-b border-gray-200 dark:border-gray-700 border-dashed">
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-medium text-gray-700 dark:text-gray-200">Код блокировки (PIN)</span>
                        </div>
                        <p class="text-xs text-gray-500 mb-2">Запрашивается при каждом открытии (локально)</p>
                        <button onclick="promptForPasswordSetting('applock')" class="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 p-2 rounded-lg outline-none transition-colors text-left uppercase text-[11px] font-bold tracking-wider text-center">
                            ${localStorage.getItem('vibegram_app_lock_' + state.currentUser?.id) ? 'Сменить PIN-код' : 'Установить PIN-код'}
                        </button>
                    </div>
                    <div class="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 border-dashed">
                        <span class="font-medium text-gray-700 dark:text-gray-200">Кто видит время захода</span>
                        <select id="settings-privacy" class="bg-transparent text-blue-500 font-medium outline-none text-right appearance-none cursor-pointer" onchange="saveSettings()">
                            <option value="everyone" ${settings.privacy === 'everyone' ? 'selected' : ''}>Все</option>
                            <option value="nobody" ${settings.privacy === 'nobody' ? 'selected' : ''}>Никто</option>
                        </select>
                    </div>
                    <div class="flex items-center justify-between p-3">
                        <div class="flex items-center gap-3">
                            <span class="font-medium text-gray-700 dark:text-gray-200">Уведомления</span>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="settings-notif" class="sr-only peer" ${settings.notifications ? 'checked' : ''} onchange="saveSettings()">
                            <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                    </div>
                </div>
            </details>
        </div>
        
        <details class="group bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 open:shadow-sm transition-all mb-4 ${mode === 'profile' ? 'hidden' : ''}">
            <summary class="flex justify-between items-center p-4 cursor-pointer select-none font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg></div>
                    Дополнительно
                </div>
                <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </summary>
            <div class="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/80 p-3 space-y-2">
                ${state.isAdminStatus || (window as any).originalAdminUser ? '' : `
                <button onclick="logout()" class="w-full py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-red-600 dark:text-red-400 rounded-xl font-semibold flex items-center gap-3 px-4">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3-3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                    Выйти из аккаунта
                </button>
                ${settings.is_tech_support ? '' : `
                <button onclick="deleteAccount()" class="w-full py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-red-600 dark:text-red-400 rounded-xl font-semibold flex items-center gap-3 px-4">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Удалить аккаунт
                </button>
                `}
                `}
                ${state.isAdminStatus || (window as any).originalAdminUser ? '' : settings.is_tech_support ? (settings.support_permissions && (settings.support_permissions.analytics || settings.support_permissions.reset_auth) ? `
                <button onclick="window.openTechSupportPanel()" class="w-full py-3 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors text-purple-600 dark:text-purple-400 rounded-xl font-semibold flex items-center gap-3 px-4">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Панель тех. поддержки
                </button>
                ` : '') : `
                <button onclick="window.contactTechSupport()" class="w-full py-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-blue-600 dark:text-blue-400 rounded-xl font-semibold flex items-center gap-3 px-4">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                    Техническая поддержка
                </button>
                `}
                <div class="mt-4 flex flex-col items-center justify-center space-y-1 pb-2">
                    <button onclick="window.openTermsModal()" class="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline-offset-4 hover:underline transition-all group outline-none">
                        Правила пользования<span class="group-hover:opacity-100 opacity-0 transition-opacity ml-1">→</span>
                    </button>
                    <div class="text-xs text-gray-400 font-mono cursor-pointer select-none" id="version-text">
                        v 1.2.0 • Vibegram
                    </div>
                </div>
            </div>
        </details>
        </div>
    `;
    document.getElementById('modal-overlay')!.classList.remove('hidden');

    if (bonusTimerInterval) clearInterval(bonusTimerInterval);
    bonusTimerInterval = setInterval(() => {
        if (document.getElementById('modal-overlay')?.classList.contains('hidden')) {
            clearInterval(bonusTimerInterval);
            return;
        }
        updateBonusProgress();
    }, 1000);
    updateBonusProgress();

    let clickCount = 0;
    document.getElementById('version-text')?.addEventListener('click', () => {
        if (state.isAdminStatus || (window as any).originalAdminUser) return;
        
        // Disable on phones
        if (window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent)) {
            return;
        }

        clickCount++;
        if (clickCount >= 7) {
            clickCount = 0;
            import('./admin').then(m => m.promptCreatorAccess());
        }
    });

    (window as any).contactTechSupport = async () => {
        if (state.isAdminStatus || (window as any).originalAdminUser) return;
        closeModal();
        const { data: myChats } = await supabase.from('chat_members').select('chat_id').eq('user_id', state.currentUser!.id);
        const myChatIds = myChats?.map(c => c.chat_id) || [];
        
        let existingChatId = null;
        if (myChatIds.length > 0) {
            const { data: existingSupport } = await supabase.from('chats').select('id').in('id', myChatIds).eq('description', 'TECH_SUPPORT_CHAT').limit(1);
            if (existingSupport && existingSupport.length > 0) {
                existingChatId = existingSupport[0].id;
            }
        }

        if (existingChatId) {
            import('./chat').then(m => m.openChat(existingChatId, 'Служба поддержки', 'С', true, 'private', [], '', 'TECH_SUPPORT_CHAT', false));
            return;
        }

        const newId = crypto.randomUUID();
        const { error } = await supabase.from('chats').insert({
            id: newId, type: 'private', description: 'TECH_SUPPORT_CHAT', title: 'Служба поддержки - ' + state.currentProfile!.display_name
        });
        
        if (!error) {
            await supabase.from('chat_members').insert({ chat_id: newId, user_id: state.currentUser!.id, role: 'member' });
            import('./chat').then(m => {
                m.loadChats();
                m.openChat(newId, 'Служба поддержки', 'С', true, 'private', [], '', 'TECH_SUPPORT_CHAT', false);
            });
        }
    };
}

export async function uploadAvatar(e: any) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const { uploadToCloudinary } = await import('./utils');
        const url = await uploadToCloudinary(file, true);
        await supabase.from('profiles').update({ avatar_url: url }).eq('id', state.currentUser.id);
        state.currentProfile.avatar_url = url;
        openSettings(); // Refresh modal
        
        // Update main UI
        const myAvatar = document.getElementById('my-avatar');
        if(myAvatar) {
            const nickname = state.currentProfile?.display_name || state.currentProfile?.username || 'U';
            myAvatar.innerHTML = `<img src="${url}" class="w-full h-full object-cover rounded-full"> <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-10"></div>`;
        }
    } catch(err) {
        console.error(err);
        alert('Ошибка загрузки аватара');
    }
}

export async function saveSettings() {
    const newName = (document.getElementById('settings-name') as HTMLInputElement).value.trim();
    const newBio = (document.getElementById('settings-bio') as HTMLTextAreaElement).value.trim();
    const notif = (document.getElementById('settings-notif') as HTMLInputElement).checked;
    const theme = (document.getElementById('settings-theme') as HTMLInputElement).checked ? 'dark' : 'light';
    const textSize = parseInt((document.getElementById('settings-text-size') as HTMLInputElement).value) || 15;
    const privacy = (document.getElementById('settings-privacy') as HTMLSelectElement).value;
    const chatBg = (document.getElementById('settings-chat-bg') as HTMLInputElement).value;
    
    // Parse paid message price if it exists
    const paidPriceInput = document.getElementById('settings-paid-message-price') as HTMLInputElement;
    const paid_message_price = paidPriceInput ? parseInt(paidPriceInput.value) || 0 : undefined;
    
    if(!newName || newName.length < 3 || newName.length > 35) return alert('Имя должно быть от 3 до 35 символов');
    
    const oldSettings = state.currentProfile?.settings || {};
    const newSettings = { ...oldSettings, notifications: notif, privacy, theme, textSize, chatBg };
    if (paid_message_price !== undefined) {
        newSettings.paid_message_price = paid_message_price < 0 ? 0 : paid_message_price;
    }
    
    await supabase.from('profiles').update({ 
        display_name: newName, 
        bio: newBio,
        settings: newSettings
    }).eq('id', state.currentUser.id);
    
    state.currentProfile.display_name = newName; 
    state.currentProfile.bio = newBio;
    state.currentProfile.settings = newSettings;
    
    const isPremium = state.currentProfile?.is_premium && (!state.currentProfile.premium_until || new Date(state.currentProfile.premium_until) > new Date());
    const badge = isPremium ? `<span class="inline-flex items-center justify-center ml-1 shrink-0" title="Vibegram Premium"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-3.5 h-3.5 object-contain" alt="Premium"></span>` : '';
    document.getElementById('my-nickname')!.innerHTML = `<span class="flex items-center">${newName}${badge}</span>`;
    
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    
    // Apply text size to messages using a CSS variable
    document.documentElement.style.setProperty('--msg-text-size', `${textSize}px`);
    
    if (chatBg && chatBg !== 'default') {
        const chatContainer = document.getElementById('chat-area');
        if (chatContainer) {
            chatContainer.className = chatContainer.className.replace(/bg-premium-\d|bg-anim-\d|bg-pattern-dots|chat-bg/g, '').trim();
            chatContainer.classList.add(chatBg);
        }
    } else {
        const chatContainer = document.getElementById('chat-area');
        if (chatContainer) {
            chatContainer.className = chatContainer.className.replace(/bg-premium-\d|bg-anim-\d|bg-pattern-dots|chat-bg/g, '').trim();
            chatContainer.classList.add('chat-bg');
        }
    }
    
    loadChats();
}

export function saveAppLock(pin: string) {
    if (!state.currentUser) return;
    if (pin.trim()) {
        localStorage.setItem('vibegram_app_lock_' + state.currentUser.id, pin.trim());
        import('./utils').then(m => m.customToast('PIN-код установлен. Он будет запрашиваться при входе.'));
    } else {
        localStorage.removeItem('vibegram_app_lock_' + state.currentUser.id);
        import('./utils').then(m => m.customToast('PIN-код отключен.'));
    }
    openSettings(); // refresh UI
}

export async function promptForPasswordSetting(type: '2fa' | 'applock') {
    const is2FA = type === '2fa';
    const title = is2FA ? 'Двухэтапный пароль' : 'Локальный PIN-код';
    const desc = is2FA ? 'Оставьте пустым, чтобы отключить' : 'Оставьте пустым, чтобы отключить';
    
    // Create custom password prompt via DOM
    const modal = document.getElementById('modal-content')!;
    modal.innerHTML = `
        <div class="p-6">
            <div class="mb-4 text-center">
                <div class="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900 text-blue-500 dark:text-blue-300 rounded-full flex items-center justify-center mb-4">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                </div>
                <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">${title}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">${desc}</p>
            </div>
            <div class="space-y-3">
                <input type="password" id="pass-input-1" placeholder="Новый пароль" class="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-center tracking-widest">
                <input type="password" id="pass-input-2" placeholder="Повторите пароль" class="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-center tracking-widest">
                <p id="pass-error" class="text-red-500 text-xs h-4 text-center"></p>
            </div>
            <div class="flex justify-end gap-2 mt-6">
                <button id="pass-cancel" class="flex-1 py-3 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors font-medium">Отмена</button>
                <button id="pass-save" class="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors font-medium">Сохранить</button>
            </div>
        </div>
    `;
    
    document.getElementById('modal-overlay')!.classList.remove('hidden');
    
    document.getElementById('pass-cancel')!.onclick = () => {
        closeModal();
    };
    
    document.getElementById('pass-save')!.onclick = async () => {
        const p1 = (document.getElementById('pass-input-1') as HTMLInputElement).value;
        const p2 = (document.getElementById('pass-input-2') as HTMLInputElement).value;
        
        if (p1 !== p2) {
            document.getElementById('pass-error')!.innerText = 'Пароли не совпадают';
            return;
        }
        
        closeModal();
        
        if (is2FA) {
            const oldSettings = state.currentProfile?.settings || {};
            const newSettings = { ...oldSettings };
            if (p1.trim()) {
                newSettings.twoStepPasscode = p1;
                import('./utils').then(m => m.customToast('Двухэтапный пароль установлен'));
            } else {
                delete newSettings.twoStepPasscode;
                import('./utils').then(m => m.customToast('Двухэтапный пароль отключен'));
            }
            if (state.currentProfile) state.currentProfile.settings = newSettings;
            await supabase.from('profiles').update({ settings: newSettings }).eq('id', state.currentUser!.id);
            openSettings(); // refresh UI
        } else {
            saveAppLock(p1);
        }
    };
}

export function closeSettings() {
    closeModal();
    if (bonusTimerInterval) clearInterval(bonusTimerInterval);
}

let lastStateTodaySeconds = -1;
let localBonusSecondsOffset = 0;

function updateBonusProgress() {
    const weekly = state.currentProfile?.settings?.vib_weekly || {};
    const todayStr = new Date().toISOString().split('T')[0];
    
    // If local state still has yesterday's date, treat it as 0 to avoid "13 minutes" bug
    let dbSeconds = weekly.todaySeconds || 0;
    if (weekly.todayDate && weekly.todayDate !== todayStr) {
        dbSeconds = 0;
    }
    
    if (dbSeconds !== lastStateTodaySeconds) {
        lastStateTodaySeconds = dbSeconds;
        localBonusSecondsOffset = 0;
    } else if (dbSeconds < 900) {
        localBonusSecondsOffset++;
    }
    
    let todaySeconds = dbSeconds + localBonusSecondsOffset;
    
    // Cap visual progress at 899s (00:01 left) if server hasn't confirmed the 900s limit yet.
    // This prevents showing "Получен!" while actually waiting for the background heartbeat to sync.
    if (todaySeconds >= 900 && dbSeconds < 900) {
        todaySeconds = 899; 
    }
    todaySeconds = Math.min(900, todaySeconds);
    
    const progress = Math.min(100, (todaySeconds / 900) * 100);
    const timeLeft = Math.max(0, 900 - todaySeconds);
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    
    const display = document.getElementById('bonus-timer-display');
    const bar = document.getElementById('bonus-progress-bar');
    const streak = document.getElementById('bonus-streak-display');
    
    if (display) {
        if (dbSeconds >= 900) {
            display.innerText = 'Получен!';
            display.classList.add('text-green-300');
            display.classList.remove('text-white/90');
            if (bar) {
                bar.classList.add('from-green-400', 'to-emerald-500');
                bar.classList.remove('from-yellow-300', 'to-yellow-500');
            }
        } else {
            // Visual text while waiting for server sync
            if (todaySeconds === 899) {
                display.innerText = 'Синхронизация...';
            } else {
                display.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
            display.classList.remove('text-green-300');
            display.classList.add('text-white/90');
            if (bar) {
                bar.classList.remove('from-green-400', 'to-emerald-500');
                bar.classList.add('from-yellow-300', 'to-yellow-500');
            }
        }
    }
    if (bar) bar.style.width = `${progress}%`;
    if (streak) {
        streak.innerHTML = `Серия: <strong>${weekly.daysMet || 0} дней</strong> <span>Из 7 для бонуса</span>`;
    }
}

(window as any).buyPremiumModal = async () => {
    const modal = document.getElementById('modal-content')!;
    modal.innerHTML = '<div class="p-8 text-center text-gray-500">Загрузка цен...</div>';
    document.getElementById('modal-overlay')!.classList.remove('hidden');

    const { data: s30 } = await supabase.from('admin_settings').select('value').eq('key', 'premium_30d_price').single();
    const { data: s365 } = await supabase.from('admin_settings').select('value').eq('key', 'premium_365d_price').single();
    
    const p30 = s30 ? parseInt(s30.value) || 50 : 50;
    const p365 = s365 ? parseInt(s365.value) || 300 : 300;

    modal.innerHTML = `
        <div class="p-6">
            <div class="text-center mb-6">
                <div class="w-20 h-20 mx-auto bg-gradient-to-br from-indigo-100 to-white rounded-full flex items-center justify-center p-4 shadow-lg shadow-indigo-500/30 mb-4"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>
                <h3 class="text-2xl font-bold dark:text-white">VIBEGRAM PREMIUM</h3>
                <p class="text-gray-500 dark:text-gray-400 mt-2 text-sm">Откройте эксклюзивные возможности и премиум-статус</p>
            </div>
            
            <div class="space-y-3 mb-6">
                <!-- pricing cards -->
                <button onclick="window.confirmBuyPremium(${p30}, 30)" class="w-full relative overflow-hidden group bg-gray-50 hover:bg-orange-50 dark:bg-gray-800 dark:hover:bg-gray-700 p-4 rounded-2xl text-left transition-colors border border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-500/50">
                    <div class="flex justify-between items-center">
                        <div>
                            <div class="font-bold text-gray-900 dark:text-white">1 Месяц</div>
                            <div class="text-xs text-gray-500">30 дней премиума</div>
                        </div>
                        <div class="font-bold font-mono text-orange-500">${p30} VIB</div>
                    </div>
                </button>
                <button onclick="window.confirmBuyPremium(${p365}, 365)" class="w-full relative overflow-hidden group bg-gray-50 hover:bg-orange-50 dark:bg-gray-800 dark:hover:bg-gray-700 p-4 rounded-2xl text-left transition-colors border border-orange-500/30">
                    <div class="absolute top-0 right-0 bg-gradient-to-r from-orange-400 to-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">ВЫГОДНО</div>
                    <div class="flex justify-between items-center">
                        <div>
                            <div class="font-bold text-gray-900 dark:text-white">1 Год</div>
                            <div class="text-xs text-gray-500">365 дней премиума</div>
                        </div>
                        <div class="font-bold font-mono text-orange-500">${p365} VIB</div>
                    </div>
                </button>
            </div>
            
            <button onclick="window.closeModal()" class="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors">Отмена</button>
        </div>
    `;
};

let isBuyPremiumProcessing = false;
(window as any).confirmBuyPremium = async (cost: number, days: number) => {
    if (isBuyPremiumProcessing) return;
    const { customConfirm, customAlert, customToast } = await import('./utils');
    const bal = state.currentProfile?.vib_balance || 0;
    if (bal < cost) {
        customAlert('У вас недостаточно VIB для покупки.');
        return;
    }
    const yes = await customConfirm(`Списать ${cost} VIB за подписку на ${days} дней?`);
    if (!yes) return;
    
    isBuyPremiumProcessing = true;
    try {
        const { error } = await supabase.rpc('buy_premium', { cost: cost, duration_days: days });
        if (error) throw error;
        
        const { data } = await supabase.from('profiles').select('vib_balance, is_premium, premium_until').eq('id', state.currentUser!.id).single();
        if (data && state.currentProfile) {
            state.currentProfile.vib_balance = data.vib_balance;
            state.currentProfile.is_premium = data.is_premium;
            state.currentProfile.premium_until = data.premium_until;
        }
        
        customToast('Premium успешно активирован! 🎉');
        // Need to call openSettings but since it's inside this file, we can just call it
        openSettings();
    } catch (e: any) {
        console.error(e);
        customAlert('Ошибка при покупке: ' + e.message);
    } finally {
        isBuyPremiumProcessing = false;
    }
};

(window as any).sendVibToUserModal = (targetUsername: string) => {
    const modal = document.getElementById('modal-content')!;
    modal.setAttribute('data-prevent-bg-close', 'true');
    modal.innerHTML = `
        <div class="p-6">
            <h3 class="text-xl font-bold dark:text-white mb-4">Отправить VIB</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Кому: <strong>@${targetUsername}</strong></p>
            <div class="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-xl mb-4 text-xs text-yellow-800 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800/30">
                <strong>Внимание:</strong> Убедитесь, что вы отправляете VIB правильному пользователю. Перевод нельзя отменить! Максимум 10000 VIB за раз.
            </div>
            
            <input type="hidden" id="vib-transfer-username" value="${targetUsername}">
            <input type="number" id="vib-transfer-amount" placeholder="Сумма VIB" class="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-xl mb-3 outline-none" max="10000" min="10">
            <input type="text" id="vib-transfer-note" placeholder="Сообщение к переводу (необязательно)" class="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-xl mb-4 outline-none">
            
            <div class="flex gap-2">
                <button onclick="window.closeModal()" class="flex-1 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-xl transition-colors font-medium dark:text-white">Отмена</button>
                <button onclick="window.confirmSendVib()" class="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors font-medium">Отправить</button>
            </div>
        </div>
    `;
    document.getElementById('modal-overlay')!.classList.remove('hidden');
};

(window as any).sendVibModal = () => {
    const modal = document.getElementById('modal-content')!;
    modal.setAttribute('data-prevent-bg-close', 'true');
    modal.innerHTML = `
        <div class="p-6">
            <h3 class="text-xl font-bold dark:text-white mb-4">Отправить VIB</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Введите имя пользователя и сумму для перевода.</p>
            <div class="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-xl mb-4 text-xs text-yellow-800 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800/30">
                <strong>Внимание:</strong> VIB будут переведены моментально. Если вы ошибетесь ником, вернуть валюту мы не сможем! Будьте внимательны. Максимум 10000 VIB за раз.
            </div>
            
            <input type="text" id="vib-transfer-username" placeholder="Username" oninput="this.value = this.value.replace(/^@/, '')" class="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-xl mb-3 outline-none">
            <input type="number" id="vib-transfer-amount" placeholder="Сумма VIB" class="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-xl mb-3 outline-none" max="10000" min="10">
            <input type="text" id="vib-transfer-note" placeholder="Сообщение к переводу (необязательно)" class="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-xl mb-4 outline-none">
            
            <div class="flex gap-2">
                <button onclick="window.closeModal()" class="flex-1 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-xl transition-colors font-medium dark:text-white">Отмена</button>
                <button onclick="window.confirmSendVib()" class="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors font-medium">Отправить</button>
            </div>
        </div>
    `;
    document.getElementById('modal-overlay')!.classList.remove('hidden');
};

let isSendVibProcessing = false;
(window as any).confirmSendVib = async () => {
    if (isSendVibProcessing) return;
    let rawUsername = (document.getElementById('vib-transfer-username') as HTMLInputElement).value.trim();
    const username = rawUsername.replace(/^@/, ''); // Remove starting @ if typed string
    const amount = parseInt((document.getElementById('vib-transfer-amount') as HTMLInputElement).value.trim());
    const note = (document.getElementById('vib-transfer-note') as HTMLInputElement)?.value.trim() || '';
    
    const { customAlert, customToast } = await import('./utils');
    
    if (!username || isNaN(amount) || amount < 10) {
        customAlert('Пожалуйста, введите корректные данные. Минимальная сумма 10 VIB.');
        isSendVibProcessing = false;
        return;
    }

    if (amount > 10000) {
        customAlert('Максимум 10000 VIB за один перевод.');
        return;
    }
    
    const bal = state.currentProfile?.vib_balance || 0;
    if (bal < amount) {
        customAlert('Недостаточно VIB на балансе.');
        return;
    }
    
    isSendVibProcessing = true;
    try {
        const { data: targetUser } = await supabase.from('profiles').select('id, display_name').eq('username', username).single();
        if (!targetUser) {
            customAlert('Пользователь с таким username не найден.');
            isSendVibProcessing = false;
            return;
        }
        
        if (targetUser.id === state.currentUser?.id) {
            customAlert('Нельзя отправить VIB самому себе.');
            isSendVibProcessing = false;
            return;
        }
        
        // Второе подтверждение (хотя UI предупреждает, можно еще раз)
        if (!confirm(`Вы действительно хотите отправить ${amount} VIB пользователю @${username}? Это действие необратимо!`)) {
            isSendVibProcessing = false;
            return;
        }
        
        const { error } = await supabase.rpc('transfer_vib', { receiver_id: targetUser.id, amount: amount, note: note });
        if (error) {
            // Если функция со старой сигнатурой
            if (error.message.includes('Function transfer_vib') && error.message.includes('does not exist')) {
                 const { error: error2 } = await supabase.rpc('transfer_vib', { receiver_id: targetUser.id, amount: amount });
                 if (error2) throw error2;
                 
                 // Попытка записать в историю ручками (если нет функции)
                 try {
                     await supabase.from('vib_transfers').insert({ sender_id: state.currentUser?.id, receiver_id: targetUser.id, amount, message: note });
                 } catch(e) {}
            } else {
                 throw error;
            }
        }
        
        const { data } = await supabase.from('profiles').select('vib_balance').eq('id', state.currentUser!.id).single();
        if (data && state.currentProfile) {
            state.currentProfile.vib_balance = data.vib_balance;
        }

        // Отправка автоматического сообщения в чат
        const { data: myChats } = await supabase.from('chat_members').select('chat_id').eq('user_id', state.currentUser!.id);
        const { data: commonChats } = await supabase.from('chat_members').select('chat_id, chats!inner(type)').in('chat_id', myChats?.map((c: any) => c.chat_id) || []).eq('user_id', targetUser.id).in('chats.type', ['direct', 'private']);
        
        let chatIdToUse;
        if (commonChats && commonChats.length > 0) {
            chatIdToUse = commonChats[0].chat_id;
        } else {
            const newChatId = crypto.randomUUID();
            await supabase.from('chats').insert({ id: newChatId, type: 'private' });
            await supabase.from('chat_members').insert([
                { chat_id: newChatId, user_id: state.currentUser!.id },
                { chat_id: newChatId, user_id: targetUser.id }
            ]);
            chatIdToUse = newChatId;
        }
    
        const messageNotePart = note ? `\n\n💬 "${note}"` : '';
        await supabase.from('messages').insert({
            chat_id: chatIdToUse,
            sender_id: state.currentUser!.id,
            content: `💎 Я перевел(а) тебе ${amount} VIB!${messageNotePart}`,
            message_type: 'text'
        });
        
        customToast(`${amount} VIB успешно отправлено ${targetUser.display_name}!`);
        openSettings();
    } catch (e: any) {
        console.error(e);
        customAlert('Ошибка при отправке. Возможно, база данных еще не обновлена. Подробнее: ' + e.message);
    } finally {
        isSendVibProcessing = false;
    }
};

(window as any).openVibHistory = async () => {
    const modal = document.getElementById('modal-content')!;
    modal.setAttribute('data-prevent-bg-close', 'true');
    modal.innerHTML = `
        <div class="p-6 h-full flex flex-col max-h-[85vh]">
            <div class="flex justify-between items-center mb-6 shrink-0">
                <div class="flex gap-2 items-center">
                    <button onclick="window.openSettings()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors flex items-center justify-center">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                    </button>
                    <h3 class="text-xl font-bold dark:text-white">История VIB</h3>
                </div>
                <button onclick="window.closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-full transition-colors">✕</button>
            </div>
            <div id="vib-history-list" class="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3">
                <div class="flex justify-center p-4"><div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
            </div>
        </div>
    `;
    document.getElementById('modal-overlay')!.classList.remove('hidden');

    try {
        const { data, error } = await supabase
            .from('vib_transfers')
            .select('amount, created_at, message, sender_id, receiver_id, sender:profiles!sender_id(display_name, username), receiver:profiles!receiver_id(display_name, username)')
            .or(`sender_id.eq.${state.currentUser!.id},receiver_id.eq.${state.currentUser!.id}`)
            .order('created_at', { ascending: false })
            .limit(50);
            
        if (error) {
            console.error(error);
            // It could be that vib_transfers doesn't exist yet, hide error
            document.getElementById('vib-history-list')!.innerHTML = '<div class="text-center text-sm text-red-500 p-4">История пока недоступна (попросите создателя запустить SQL-скрипт).</div>';
            return;
        }

        if (!data || data.length === 0) {
            document.getElementById('vib-history-list')!.innerHTML = '<div class="text-center text-sm text-gray-500 dark:text-gray-400 p-4">История пуста.</div>';
            return;
        }

        document.getElementById('vib-history-list')!.innerHTML = data.map((t: any) => {
            let isSent = t.sender_id === state.currentUser!.id;
            const otherUser = isSent ? t.receiver : t.sender;
            
            let titleStr = `${isSent ? 'Перевод пользователю' : 'От пользователя'} <strong>@${otherUser?.username || 'Unknown'}</strong>`;
            let amountStr = isSent ? '-' : '+';
            let colorCls = isSent ? 'text-red-500' : 'text-green-500';

            // Exception for admin grants
            if (t.message?.includes('Выдача Создателем') || t.message?.includes('Баланс аннулирован Создателем')) {
                if (isSent) {
                    titleStr = `Начислено пользователю <strong>@${otherUser?.username || 'Unknown'}</strong> (Система)`;
                    amountStr = ''; // Don't show minus for the admin
                    colorCls = 'text-blue-500';
                } else {
                    titleStr = `От Создателя`;
                }
            } else if (t.message === 'Ежедневный бонус' || t.message?.includes('Бонус за 7 дней')) {
                titleStr = `Системное начисление`;
                amountStr = '+';
                colorCls = 'text-green-500';
                isSent = false;
            }

            return `
                <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div class="flex justify-between items-center mb-1">
                        <div class="font-medium text-sm text-gray-800 dark:text-gray-200">
                            ${titleStr}
                        </div>
                        <div class="font-bold whitespace-nowrap ${colorCls}">
                            ${amountStr}${t.amount} VIB
                        </div>
                    </div>
                    ${t.message ? `<div class="text-xs text-gray-600 dark:text-gray-400 italic mb-1">"${t.message}"</div>` : ''}
                    <div class="text-[10px] text-gray-400">
                        ${new Date(t.created_at).toLocaleString()}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error(e);
        document.getElementById('vib-history-list')!.innerHTML = '<div class="text-center text-sm text-red-500 p-4">Ошибка загрузки.</div>';
    }
};

(window as any).openTermsModal = () => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 modal-enter';
    
    // Smooth, professional UI for terms
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transform transition-all">
            <div class="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/30">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">Правила пользования</h2>
                        <div class="text-xs text-gray-500 dark:text-gray-400 font-medium">Vibegram Messenger</div>
                    </div>
                </div>
                <button id="close-terms-btn" class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors outline-none focus:ring-2 ring-blue-500">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            
            <div class="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 text-gray-700 dark:text-gray-300">
                
                <section>
                    <h3 class="text-base font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                        <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        1. Общие положения
                    </h3>
                    <p class="text-sm leading-relaxed mb-2 ml-3.5">
                        Добро пожаловать в Vibegram! Данный мессенджер предоставляет платформу для обмена личными сообщениями, файлами и звонками.
                        Используя приложение, вы соглашаетесь с данными правилами.
                    </p>
                </section>

                <section>
                    <h3 class="text-base font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        2. Запрещенный контент
                    </h3>
                    <p class="text-sm leading-relaxed mb-2 ml-3.5">В Vibegram строго запрещено:</p>
                    <ul class="list-disc text-sm ml-8 space-y-1">
                        <li>Распространение незаконных материалов и мошенничество.</li>
                        <li>Оскорбления, угрозы и разжигание ненависти.</li>
                        <li>Спам, навязчивая реклама и фишинг.</li>
                    </ul>
                </section>

                <section>
                    <h3 class="text-base font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                        <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        3. Аккаунты и Устройства
                    </h3>
                    <p class="text-sm leading-relaxed ml-3.5">
                        В целях безопасности и предотвращения злоупотреблений, <b>создание множества новых аккаунтов на одном устройстве запрещено</b>. 
                        Однако вы по-прежнему можете беспрепятственно входить в уже существующие аккаунты.
                    </p>
                </section>

                <section>
                    <h3 class="text-base font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        4. Конфиденциальность
                    </h3>
                    <p class="text-sm leading-relaxed ml-3.5">
                        Мы уважаем вашу конфиденциальность. Ваши личные переписки не передаются третьим лицам. 
                        Администрация может вмешаться только по жалобе на нарушение правил (раздел 2).
                    </p>
                </section>
                
                <section>
                    <h3 class="text-base font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                        <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                        5. Инструкции и Скрытые Фишки
                    </h3>
                    <div class="text-sm leading-relaxed ml-3.5 space-y-4">
                        <div>
                            <span class="font-bold text-gray-800 dark:text-gray-200 block mb-1">💬 Сообщения и Вызовы</span>
                            <ul class="list-disc ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                                <li><b>Двойной клик или долгое нажатие</b> по сообщению открывает меню действий: ответ, редактирование, закрепление, удаление или копирование. Быстрые реакции находятся в этом же меню.</li>
                                <li>Для отправки голосового сообщения удерживайте кнопку микрофона. Свайп вверх или отвод мыши наверх заблокирует запись, чтобы не держать кнопку.</li>
                                <li>В мессенджере доступны голосовые и видео-звонки высокого качества (ищите иконки в шапке чата).</li>
                            </ul>
                        </div>

                        <div>
                            <span class="font-bold text-gray-800 dark:text-gray-200 block mb-1">🎮 Мини-приложения и Сторисы (Shorts)</span>
                            <ul class="list-disc ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                                <li>Vibegram поддерживает мини-приложения. Их можно открыть через меню "плюсика" внизу или специальную кнопку в боковой панели.</li>
                                <li>Откройте уникальный раздел <b>Shorts</b> для просмотра коротких видео от участников комьюнити! Лайкайте, комментируйте и подписывайтесь. Вы можете загрузить свой собственный шортс нажав на иконку камеры.</li>
                            </ul>
                        </div>

                        <div>
                            <span class="font-bold text-gray-800 dark:text-gray-200 block mb-1">💎 VIB Coins (Внутренняя валюта)</span>
                            <ul class="list-disc ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                                <li>VIB — это наша внутренняя валюта, которую можно переводить другим пользователям.</li>
                                <li>Нажмите на <b>кнопку скрепки</b> в чате, чтобы выбрать «Отправить VIB» и порадовать друга.</li>
                                <li>История ваших переводов и баланс находятся на вкладке «Кошелек» в настройках профиля.</li>
                            </ul>
                        </div>

                        <div>
                            <span class="font-bold text-gray-800 dark:text-gray-200 block mb-1">⚙️ Кастомизация и Приватность</span>
                            <ul class="list-disc ml-5 space-y-1 text-gray-600 dark:text-gray-400">
                                <li><b>ПИН-код:</b> Защитите свои переписки от посторонних глаз, установив локальный ПИН-код на запуск приложения (Настройки → Конфиденциальность).</li>
                                <li><b>Для глаз:</b> Меняйте светлую и темную тему, а также выбирайте крутые анимированные фоны чата на свой вкус.</li>
                                <li>Не забудьте настроить свой красивый никнейм и загрузить аватарку в настройках!</li>
                            </ul>
                        </div>
                    </div>
                </section>

            </div>
            
            <div class="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                <button id="accept-terms-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all focus:ring-4 ring-blue-500/30 outline-none">
                    Понятно
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => {
        overlay.classList.add('opacity-0');
        overlay.querySelector('div')?.classList.add('scale-95');
        setTimeout(() => overlay.remove(), 200);
    };

    overlay.querySelector('#close-terms-btn')?.addEventListener('click', closeModal);
    overlay.querySelector('#accept-terms-btn')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
};
