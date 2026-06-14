import { supabase, state } from './supabase';
import { getFakeEmail, showError, customConfirm } from './utils';
import { loadChats } from './chat';
import { initWebRTC } from './webrtc';

export async function loginWithGoogle() {
    const btn = event?.currentTarget as HTMLButtonElement | undefined;
    if (btn) btn.disabled = true;
    try {
        const clientId = '362424832513-mdflqja6lr0jq81es5frq66vqic6i1n9.apps.googleusercontent.com';
        const exactRedirectUrl = window.location.origin + window.location.pathname;
        
        const rawNonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(31)))).replace(/=/g, '');
        const encoder = new TextEncoder();
        const encodedNonce = encoder.encode(rawNonce);
        const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        
        localStorage.setItem('supabase-auth-nonce', rawNonce);
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(exactRedirectUrl)}&response_type=id_token&scope=${encodeURIComponent('openid email profile')}&nonce=${hashedNonce}&prompt=select_account`;
        window.location.href = authUrl;
    } catch (err: any) {
        if (btn) btn.disabled = false;
        import('./utils').then(m => m.showError('Ошибка входа через Google: ' + err.message));
    }
}

export async function checkUser(authEvent?: string) {
    if ((window as any).originalAdminUser) return;
    try {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
            console.error('Auth error:', error.message || error);
            if (error.message === 'Failed to fetch') {
                import('./utils').then(m => m.showError('Не удалось подключиться к серверу (Failed to fetch). Возможно, база данных Supabase остановлена.'));
            }
            return;
        }
        if (user) {
            const SUPABASE_URL = supabase['supabaseUrl'] || 'default';
            const deviceRegKey = 'vibegram_device_registered_' + SUPABASE_URL;
            const registeredUserIdKey = 'vibegram_registered_user_id_' + SUPABASE_URL;
            const isDeviceRegistered = localStorage.getItem(deviceRegKey);
            const registeredUserId = localStorage.getItem(registeredUserIdKey);
            const accountAgeMs = Date.now() - new Date(user.created_at).getTime();

            if (!isDeviceRegistered) {
                // First account on this device
                localStorage.setItem(deviceRegKey, 'true');
                localStorage.setItem(registeredUserIdKey, user.id);
            } else if (accountAgeMs < 120000 && registeredUserId !== user.id) { // 2 minutes
                import('./utils').then(m => m.showError('На этом устройстве уже зарегистрирован аккаунт. Создание новых аккаунтов на одном устройстве запрещено. Вы можете войти только в уже существующий аккаунт.'));
                await supabase.auth.signOut();
                state.currentUser = null;
                const loader = document.getElementById('initial-loader');
                if (loader) {
                    loader.classList.add('opacity-0', 'pointer-events-none');
                    setTimeout(() => loader.remove(), 300);
                }
                document.getElementById('auth-screen')!.classList.remove('hidden');
                
                const errElement = document.getElementById('auth-error');
                if (errElement) errElement.innerText = 'Создание новых аккаунтов на этом устройстве запрещено. Вы можете войти только в уже существующий аккаунт.';
                
                return;
            }

            state.currentUser = user;
            let { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            
            // Fallback if trigger failed to create profile
            if (!data) {
                const nickname = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.nickname || 'User';
                let username = 'user_' + user.id.substring(0, 8);
                if (user.user_metadata?.email) {
                    username = user.user_metadata.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') + '_' + user.id.substring(0, 4);
                }
                const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
                await supabase.from('profiles').insert({ id: user.id, display_name: nickname, username, avatar_url: avatarUrl });
                const { data: newData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
                data = newData;
            }
            
            state.currentProfile = data;
            
            if (data.settings?.force_pin_reset) {
                localStorage.removeItem('vibegram_app_lock_' + user.id);
                const newSettings = { ...data.settings };
                delete newSettings.force_pin_reset;
                await supabase.from('profiles').update({ settings: newSettings }).eq('id', user.id);
                data.settings = newSettings;
            }

            // Clear URL to prevent OAuth token leak or reload loops
            window.history.replaceState({}, document.title, window.location.pathname);
            
            document.getElementById('auth-screen')!.classList.add('hidden');
            
            const twoStepPasscode = data.settings?.twoStepPasscode;
            const appLock = localStorage.getItem('vibegram_app_lock_' + user.id);
            
            if (authEvent === 'SIGNED_IN') {
                sessionStorage.setItem('vibegram_applock_passed', 'true'); // bypass applock on fresh login
            }
            
            // Check if we need to show the lock screen
            if (twoStepPasscode && !localStorage.getItem('vibegram_2fa_trusted_' + user.id)) {
                if (isRecoveryMode) return; // Prevent overwriting recovery screen on tab switch
                // Show 2FA screen
                state.pendingLockType = '2fa';
                state.pendingLockValue = twoStepPasscode;
                showLockScreen('Двухэтапный пароль', 'Введите пароль вашего аккаунта');
                return;
            } else if (appLock && !sessionStorage.getItem('vibegram_applock_passed')) {
                // Show Local App Lock screen
                state.pendingLockType = 'applock';
                state.pendingLockValue = appLock;
                showLockScreen('Блокировка', 'Введите локальный PIN-код');
                return;
            }
            
            // If passed or not set, continue to app setup
            finalizeAppSetup();
        }
    } catch (err: any) {
        console.error('Failed to check user:', err);
        const loader = document.getElementById('initial-loader');
        if (loader) {
            loader.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => loader.remove(), 300);
        }
        if (err?.message === 'Failed to fetch' || err?.message?.includes('Failed to fetch')) {
            import('./utils').then(m => m.showError('Не удалось подключиться к серверу (Failed to fetch). Возможно, проект Supabase приостановлен.'));
        } else {
            import('./utils').then(m => m.showError('Ошибка сети. Проверьте подключение или статус Supabase.'));
        }
    }
}

function showLockScreen(title: string, desc: string) {
    const loader = document.getElementById('initial-loader');
    if (loader) {
        loader.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => loader.remove(), 300);
    }
    const lockScreen = document.getElementById('lock-screen')!;
    document.getElementById('lock-title')!.innerText = title;
    document.getElementById('lock-desc')!.innerText = desc;
    (document.getElementById('lock-input') as HTMLInputElement).value = '';
    document.getElementById('lock-error')!.innerText = '';
    lockScreen.classList.remove('hidden');
    document.getElementById('app-screen')!.classList.add('hidden');
}

let failedLockAttempts = 0;

export function verifyLockPasscode() {
    const input = (document.getElementById('lock-input') as HTMLInputElement).value;
    if (input === state.pendingLockValue) {
        document.getElementById('lock-screen')!.classList.add('hidden');
        failedLockAttempts = 0;
        document.getElementById('lock-forgot-btn')?.classList.add('hidden');
        
        if (state.pendingLockType === '2fa') {
            localStorage.setItem('vibegram_2fa_trusted_' + state.currentUser?.id, 'true');
        } else if (state.pendingLockType === 'applock') {
            sessionStorage.setItem('vibegram_applock_passed', 'true');
        }
        
        // Re-check locks in case both are enabled
        checkUser(); 
    } else {
        document.getElementById('lock-error')!.innerText = 'Неверный пароль';
        failedLockAttempts++;
        if (failedLockAttempts >= 3) {
            document.getElementById('lock-forgot-btn')?.classList.remove('hidden');
        }
    }
}

let resendTimer: any = null;
let resendCount = 0;
let isRecoveryMode = false;

export async function resendRecoveryCode() {
    if (!state.currentUser?.email) return;
    
    resendCount++;
    document.getElementById('lock-resend-btn')!.classList.add('hidden');
    document.getElementById('lock-resend-timer')!.classList.add('hidden');
    
    try {
        const { error } = await supabase.auth.signInWithOtp({ email: state.currentUser.email });
        if (error) throw error;
        document.getElementById('lock-error')!.innerText = 'Код отправлен';
        document.getElementById('lock-error')!.className = 'text-green-500 text-sm mt-3 h-4';
        setTimeout(() => {
             document.getElementById('lock-error')!.className = 'text-red-500 text-sm mt-3 h-4';
             document.getElementById('lock-error')!.innerText = '';
        }, 3000);
    } catch(err: any) {
        document.getElementById('lock-error')!.innerText = 'Ошибка отправки: ' + err.message;
    }
    
    if (resendTimer) clearInterval(resendTimer);
}

export async function startRecovery(skipSend = false) {
    if (!state.currentUser?.email) return;
    
    isRecoveryMode = true;
    resendCount = 0;
    showLockScreen('Восстановление', `Введите код, отправленный на ${state.currentUser.email}`);
    (document.getElementById('lock-input') as HTMLInputElement).value = '';
    (document.getElementById('lock-input') as HTMLInputElement).placeholder = '8-значный код';
    document.getElementById('lock-error')!.innerText = '';
    document.getElementById('lock-forgot-btn')?.classList.add('hidden');
    
    // Change button action
    const btn = document.getElementById('lock-unlock-btn') as HTMLButtonElement;
    btn.innerText = 'Подтвердить код';
    btn.onclick = verifyRecoveryCode;
    
    // Start resend timer if not skipSend
    let time = skipSend ? 0 : 70;
    document.getElementById('resend-time')!.innerText = time.toString();
    
    if (time > 0) {
        document.getElementById('lock-resend-btn')!.classList.add('hidden');
        document.getElementById('lock-resend-timer')!.classList.remove('hidden');
    }

    if (!skipSend) {
        try {
            const { error } = await supabase.auth.signInWithOtp({ email: state.currentUser.email });
            if (error) throw error;
        } catch (err: any) {
            document.getElementById('lock-error')!.innerText = 'Ошибка отправки кода: ' + (err.message || String(err));
        }
    }
    
    if (time > 0) {
        if (resendTimer) clearInterval(resendTimer);
        resendTimer = setInterval(() => {
            time--;
            if (time <= 0) {
                clearInterval(resendTimer);
                document.getElementById('lock-resend-btn')!.classList.remove('hidden');
                document.getElementById('lock-resend-timer')!.classList.add('hidden');
            } else {
                document.getElementById('resend-time')!.innerText = time.toString();
            }
        }, 1000);
    } else {
        document.getElementById('lock-resend-btn')!.classList.remove('hidden');
        document.getElementById('lock-resend-timer')!.classList.add('hidden');
    }
}

export async function verifyRecoveryCode() {
    if (!state.currentUser?.email) return;
    const code = (document.getElementById('lock-input') as HTMLInputElement).value;
    if (!code || code.length < 6) {
        document.getElementById('lock-error')!.innerText = 'Введите корректный код';
        return;
    }
    
    try {
        const { error } = await supabase.auth.verifyOtp({ email: state.currentUser.email, token: code, type: 'email' });
        if (error) throw error;
        
        if (resendTimer) clearInterval(resendTimer);
        document.getElementById('lock-resend-btn')!.classList.add('hidden');
        document.getElementById('lock-resend-timer')!.classList.add('hidden');
        
        // Reset locks
        localStorage.removeItem('vibegram_app_lock_' + state.currentUser.id);
        const oldSettings = state.currentProfile?.settings || {};
        delete oldSettings.twoStepPasscode;
        await supabase.from('profiles').update({ settings: oldSettings }).eq('id', state.currentUser.id);
        
        document.getElementById('lock-screen')!.classList.add('hidden');
        failedLockAttempts = 0;
        sessionStorage.setItem('vibegram_applock_passed', 'true');
        localStorage.setItem('vibegram_2fa_trusted_' + state.currentUser.id, 'true');
        
        // Restore button for future locks
        const btn = document.getElementById('lock-unlock-btn') as HTMLButtonElement;
        btn.innerText = 'Разблокировать';
        btn.onclick = verifyLockPasscode;
        
        isRecoveryMode = false;
        finalizeAppSetup();
    } catch (err: any) {
        document.getElementById('lock-error')!.innerText = 'Неверный код: ' + (err.message || String(err));
    }
}

function finalizeAppSetup() {
            const loader = document.getElementById('initial-loader');
            if (loader) {
                loader.classList.add('opacity-0', 'pointer-events-none');
                setTimeout(() => loader.remove(), 300);
            }
            document.getElementById('app-screen')!.classList.remove('hidden');
            
            const pr = state.currentProfile;
            const nickname = pr?.display_name || pr?.username || 'User';
            const isPremium = pr?.is_premium && (!pr.premium_until || new Date(pr.premium_until) > new Date());
            const badge = isPremium ? `<span class="inline-flex items-center justify-center ml-1 shrink-0" title="Vibegram Premium"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-3.5 h-3.5 object-contain" alt="Premium"></span>` : '';
            document.getElementById('my-nickname')!.innerHTML = `<span class="flex items-center">${nickname}${badge}</span>`;
            
            const avatarUrl = state.currentProfile?.avatar_url;
            document.getElementById('my-avatar')!.innerHTML = `${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full">` : nickname.charAt(0).toUpperCase()} <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-10"></div>`;
            
            const theme = state.currentProfile?.settings?.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            
            const showHeaderShorts = state.currentProfile?.settings?.show_header_shorts;
            const showHeaderMiniApps = state.currentProfile?.settings?.show_header_miniapps;
            
            const shortsBtn = document.getElementById('header-shortcut-shorts');
            const miniAppsBtn = document.getElementById('header-shortcut-miniapps');
            if (shortsBtn) {
                if (showHeaderShorts) shortsBtn.classList.remove('hidden');
                else shortsBtn.classList.add('hidden');
            }
            if (miniAppsBtn) {
                if (showHeaderMiniApps) miniAppsBtn.classList.remove('hidden');
                else miniAppsBtn.classList.add('hidden');
            }
            
            const textSize = state.currentProfile?.settings?.textSize || 15;
            document.documentElement.style.setProperty('--msg-text-size', `${textSize}px`);
            
            const chatBg = state.currentProfile?.settings?.chatBg;
            try {
                if (chatBg) localStorage.setItem('chatBg', chatBg);
            } catch(e) {}
            const chatContainer = document.getElementById('chat-area');
            if (chatContainer) {
                chatContainer.className = chatContainer.className.replace(/bg-premium-\d|bg-anim-\d|bg-pattern-dots|chat-bg/g, '').trim();
                if (chatBg && chatBg !== 'default') {
                    chatContainer.classList.add(chatBg);
                } else {
                    chatContainer.classList.add('chat-bg');
                }
            }
            
            setOnlineStatus(document.hasFocus() && !document.hidden);
            window.addEventListener('focus', () => setOnlineStatus(true));
            window.addEventListener('blur', () => setOnlineStatus(false));
            document.addEventListener('visibilitychange', () => {
                setOnlineStatus(document.hasFocus() && !document.hidden);
            });
            window.addEventListener('beforeunload', () => setOnlineStatus(false));

            if ("Notification" in window) {
                if (Notification.permission !== "granted" && Notification.permission !== "denied") {
                    Notification.requestPermission();
                }
            }

            loadChats();
            initWebRTC(); // Initialize WebRTC listener for incoming calls
            handleInviteLink();
            startVibHeartbeat();
            
            const savedIncognito = localStorage.getItem('incognito_chat_args');
            if (savedIncognito) {
                try {
                    const args = JSON.parse(savedIncognito);
                    import('./chat').then(m => {
                        state.isAdminStatus = true;
                        document.getElementById('admin-incognito-banner')?.classList.remove('hidden');
                        (m as any).openChat(...args);
                    });
                } catch(e) {}
            }
            
            // Trigger popstate so #chat=... is processed if app opened via URL/Push
            setTimeout(() => {
                const initialHash = sessionStorage.getItem('initial_hash');
                if (initialHash && initialHash.startsWith('#chat=') && window.location.hash !== initialHash) {
                    window.history.replaceState(null, '', initialHash);
                }
                sessionStorage.setItem('initial_hash_handled', 'true');
                window.dispatchEvent(new Event('popstate'));
            }, 500);
}

let vibHeartbeatTimer: any = null;
export let lastHeartbeatTime: number = 0;

export function startVibHeartbeat() {
    if (vibHeartbeatTimer) clearInterval(vibHeartbeatTimer);
    
    lastHeartbeatTime = Date.now();
    // Check initially (don't increment time, just initialize)
    processVibHeartbeat(0);
    
    // Check every 15 seconds
    vibHeartbeatTimer = setInterval(() => {
        const now = Date.now();
        let elapsedSecs = Math.floor((now - lastHeartbeatTime) / 1000);
        lastHeartbeatTime = now;
        
        // Cap elapsed time to 20 seconds in case of sleep/suspend to prevent fake farming
        if (elapsedSecs > 20) elapsedSecs = 15;
        if (elapsedSecs < 0) elapsedSecs = 0;
        
        processVibHeartbeat(elapsedSecs);
    }, 15000);
}

async function processVibHeartbeat(elapsedSeconds: number) {
    if (!state.currentUser || (window as any).originalAdminUser) return;
    try {
        const { data: profile, error: dbErr } = await supabase.from('profiles').select('settings').eq('id', state.currentUser.id).single();
        if (dbErr || !profile) return;
        
        let settings = profile.settings || {};
        let weekly = settings.vib_weekly || {};
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        const weekStart = weekly.weekStart ? new Date(weekly.weekStart) : new Date();
        const daysSinceStart = Math.floor((now.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
        
        let changed = false;
        
        // Convert old todayMinutes format to todaySeconds if necessary
        if ('todayMinutes' in weekly) {
            weekly.todaySeconds = (weekly.todayMinutes || 0) * 60;
            delete weekly.todayMinutes;
            changed = true;
        }
        
        if (!weekly.weekStart || daysSinceStart >= 7) {
            weekly = {
                weekStart: now.toISOString(),
                daysMet: 0,
                lastDayCounted: null,
                todaySeconds: 0,
                todayDate: todayStr
            };
            changed = true;
        }
        
        if (weekly.todayDate !== todayStr) {
            weekly.todayDate = todayStr;
            weekly.todaySeconds = 0;
            weekly.lastDayCounted = null;
            changed = true;
        }
        
        if (weekly.lastDayCounted !== todayStr && elapsedSeconds > 0) {
            weekly.todaySeconds = (weekly.todaySeconds || 0) + elapsedSeconds;
            changed = true;
            
            if (weekly.todaySeconds >= 900) { // 900 seconds = 15 minutes
                weekly.daysMet = (weekly.daysMet || 0) + 1;
                weekly.lastDayCounted = todayStr;
                
                let bonusAmount = 15;
                try {
                    const { data: bData } = await supabase.from('admin_settings').select('value').eq('key', 'weekly_vib_bonus').single();
                    if (bData && !isNaN(parseInt(bData.value))) {
                        bonusAmount = parseInt(bData.value);
                    }
                } catch(e) {}
                
                // Grant Daily VIB
                const { error: grantError } = await supabase.rpc('system_grant_vib', { amount: bonusAmount, note: 'Ежедневный бонус' });
                if (grantError) {
                    console.error('Failed to grant daily bonus (grantError):', grantError);
                    try {
                        const { data: p } = await supabase.from('profiles').select('vib_balance').eq('id', state.currentUser.id).single();
                        if (p) {
                            await supabase.from('profiles').update({ vib_balance: (p.vib_balance || 0) + bonusAmount }).eq('id', state.currentUser.id);
                            // Ignore insert error for vib_transfers if policy rejects it
                            const res = await supabase.from('vib_transfers').insert({ sender_id: state.currentUser.id, receiver_id: state.currentUser.id, amount: bonusAmount, message: 'Ежедневный бонус' });
                            if (res.error) throw res.error;
                        }
                    } catch(fbErr) {
                        console.error('Fallback daily bonus failed:', fbErr);
                    }
                }
                
                import('./utils').then(m => m.customToast(`Бонус +${bonusAmount} VIB 🎉`)).catch(console.error);
                
                if (weekly.daysMet >= 7) {
                    let weeklyBonusAmount = 50;
                    const { error: wGrantError } = await supabase.rpc('system_grant_vib', { amount: weeklyBonusAmount, note: 'Бонус за 7 дней активности!' });
                    if (wGrantError) {
                        try {
                            const { data: p } = await supabase.from('profiles').select('vib_balance').eq('id', state.currentUser.id).single();
                            if (p) {
                                await supabase.from('profiles').update({ vib_balance: (p.vib_balance || 0) + weeklyBonusAmount }).eq('id', state.currentUser.id);
                                const res = await supabase.from('vib_transfers').insert({ sender_id: state.currentUser.id, receiver_id: state.currentUser.id, amount: weeklyBonusAmount, message: 'Бонус за 7 дней активности!' });
                                if (res.error) throw res.error;
                            }
                        } catch(fbErr) {}
                    }
                    import('./utils').then(m => m.customToast(`🔥 Поздравляем! Дополнительные +${weeklyBonusAmount} VIB за 7 дней активности!`)).catch(console.error);
                    
                    weekly = {
                        weekStart: now.toISOString(),
                        daysMet: 0,
                        lastDayCounted: todayStr,
                        todaySeconds: 900,
                        todayDate: todayStr
                    };
                }
            }
        }
        
        if (changed) {
            settings.vib_weekly = weekly;
            await supabase.from('profiles').update({ settings }).eq('id', state.currentUser.id);
            if (state.currentProfile) state.currentProfile.settings = settings;
        }
    } catch (e) {
        console.error('Process VIB heartbeat error:', e);
    }
}

async function handleInviteLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const channelId = urlParams.get('channel');
    if (channelId) {
        // Remove the parameter from the URL without reloading
        window.history.replaceState({}, document.title, window.location.pathname);
        
        try {
            const { data: channel } = await supabase.from('chats').select('*').eq('id', channelId).eq('type', 'channel').single();
            if (channel) {
                import('./search').then(m => m.joinChannel(channel));
            } else {
                import('./utils').then(m => m.customAlert('Канал не найден.'));
            }
        } catch (e) {
            console.error('Error joining channel from link:', e);
        }
    }
}

let onlinePingInterval: number | null = null;
let currentOnlineState = false;

export async function setOnlineStatus(isOnline: boolean) {
    if(!state.currentUser || (window as any).originalAdminUser) return;
    
    // Only update if state changed, OR if it's a true periodic ping
    if (isOnline) {
        if (onlinePingInterval) clearInterval(onlinePingInterval);
        onlinePingInterval = window.setInterval(async () => {
            if (document.hasFocus() && !document.hidden && state.currentUser) {
                await supabase.from('profiles').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', state.currentUser.id);
            }
        }, 60000); // Ping every 60s while active
    } else {
        if (onlinePingInterval) clearInterval(onlinePingInterval);
        onlinePingInterval = null;
    }

    if (currentOnlineState === isOnline) {
        // If state hasn't changed, we don't need an immediate update unless it's a first load.
        // But for safety let's just let it run if it's explicitly called (e.g. reload or beforeunload).
    }
    
    currentOnlineState = isOnline;
    await supabase.from('profiles').update({ is_online: isOnline, last_seen: new Date().toISOString() }).eq('id', state.currentUser.id);
}

export async function forceLogout() {
    // Used from lock screen without confirmation
    await setOnlineStatus(false);
    if (state.currentUser) {
        localStorage.removeItem('vibegram_2fa_trusted_' + state.currentUser.id);
    }
    sessionStorage.removeItem('vibegram_2fa_passed');
    sessionStorage.removeItem('vibegram_applock_passed');
    await supabase.auth.signOut(); 
    window.location.reload(); 
}

export async function logout() { 
    if (state.isAdminStatus || (window as any).originalAdminUser) {
        import('./utils').then(m => m.customAlert("Нельзя выйти из аккаунта в режиме инкогнито/симуляции. Используйте кнопку Exit."));
        return;
    }
    const confirmed = await customConfirm('Вы уверены, что хотите выйти из аккаунта?');
    if (!confirmed) return;
    
    await forceLogout();
}

export async function deleteAccount() {
    if (state.isAdminStatus || (window as any).originalAdminUser) {
        import('./utils').then(m => m.customAlert("Нельзя удалить аккаунт в режиме инкогнито/симуляции."));
        return;
    }
    if (state.currentProfile?.settings?.is_tech_support) {
        import('./utils').then(m => m.customAlert("Аккаунты Тех. Поддержки не могут быть удалены. Для удаления, пожалуйста, попросите создателя снять с вас этот статус."));
        return;
    }
    const confirmed = await customConfirm('Вы уверены, что хотите удалить аккаунт? Это действие необратимо, все ваши данные будут удалены.');
    if (!confirmed) return;
    
    if (state.currentUser) {
        try {
            const { data: memberChats } = await supabase.from('chat_members').select('chat_id').eq('user_id', state.currentUser.id);
            if (memberChats && memberChats.length > 0) {
                const chatIds = memberChats.map(mc => mc.chat_id);
                // Fetch direct chats to delete so they disappear for the other user too
                const { data: directChats } = await supabase.from('chats').select('id').in('id', chatIds).in('type', ['direct', 'private']);
                if (directChats && directChats.length > 0) {
                    const directChatIds = directChats.map(c => c.id);
                    await supabase.from('chats').delete().in('id', directChatIds);
                }
            }
        } catch(e) {
            console.error('Error removing direct chats:', e);
        }

        try {
            const m = await import('./shorts');
            await m.deleteUserShorts(state.currentUser.id);
        } catch(e) {
            console.error('Error removing user shorts:', e);
        }

        // Delete profile (will cascade to messages and chat_members)
        await supabase.from('profiles').delete().eq('id', state.currentUser.id);
        await setOnlineStatus(false);

        await supabase.auth.signOut();
        window.location.reload();
    }
}
