import { supabase, state } from './supabase';

let shortsList: any[] = [];
let currentShortIdForComments: string | null = null;
let activeVideo: HTMLVideoElement | null = null;

export async function openShorts(initialShortId?: string, authorFilterId?: string, skipPushState = false) {
    import('./utils').then(m => m.closeModal(undefined, true));
    if (!skipPushState && window.location.hash !== '#shorts') {
        window.history.pushState({ type: 'shorts', shortId: initialShortId, authorId: authorFilterId }, '', '#shorts');
    }
    
    // Ensure overlays are hidden
    document.getElementById('shorts-analytics-screen')?.classList.add('hidden');
    document.getElementById('shorts-search-overlay')?.classList.add('hidden');
    
    const screen = document.getElementById('shorts-screen');
    if (!screen) return;
    screen.classList.remove('hidden');
    
    // Show back button if filtered by author, else hidden
    const backBtn = document.getElementById('shorts-back-btn');
    if (backBtn) {
        if (authorFilterId) backBtn.classList.remove('hidden');
        else backBtn.classList.add('hidden');
    }
    
    // Disable main scroll if any
    document.body.style.overflow = 'hidden';
    
    await loadShorts(initialShortId, authorFilterId);
}
(window as any).openShorts = openShorts;

let currentSearchFilter: 'videos' | 'channels' = 'videos';

export function openShortsSearch(skipPushState = false) {
    if (!skipPushState && window.location.hash !== '#shorts-search') {
        window.history.pushState({ type: 'shorts_search' }, '', '#shorts-search');
    }
    const overlay = document.getElementById('shorts-search-overlay');
    if (overlay) overlay.classList.remove('hidden');
    pauseAllVideos();
    const input = document.getElementById('shorts-search-full-input') as HTMLInputElement;
    if (input) input.focus();
}
(window as any).openShortsSearch = openShortsSearch;

export function closeShortsSearch() {
    if (window.location.hash === '#shorts-search') {
        window.history.back();
    } else {
        const overlay = document.getElementById('shorts-search-overlay');
        if (overlay) overlay.classList.add('hidden');
        if (activeVideo && document.getElementById('shorts-screen')?.classList.contains('hidden') === false) {
            activeVideo.play().catch(e => console.log(e));
        }
    }
}
(window as any).closeShortsSearch = closeShortsSearch;

export async function openShortsSubscriptions() {
    if (window.location.hash !== '#shorts-subscriptions') {
        window.history.pushState({ type: 'shorts_subscriptions' }, '', '#shorts-subscriptions');
    }
    const overlay = document.getElementById('shorts-subscriptions-overlay');
    if (overlay) overlay.classList.remove('hidden');
    pauseAllVideos();
    
    const list = document.getElementById('shorts-subscriptions-list');
    if (!list) return;
    
    list.innerHTML = '<div class="flex h-full items-center justify-center"><div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>';
    
    const subs = state.currentProfile?.settings?.subscriptions || [];
    if (subs.length > 0) {
        try {
            const { data } = await supabase.from('profiles').select('*').in('id', subs);
            if (data && data.length > 0) {
                list.innerHTML = data.map(p => `
                <div class="flex items-center gap-3 p-4 hover:bg-[#222222] cursor-pointer transition select-none border-b border-[#222222]" onclick="window.navigateToUserFromSubscriptions('${p.id}')">
                    <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-700 shrink-0">
                        ${p.avatar_url ? `<img src="${p.avatar_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center font-bold text-sm text-white">${(p.display_name || p.username || '?')[0].toUpperCase()}</div>`}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="font-bold text-white text-sm truncate">${p.display_name || p.username}</div>
                        ${p.username ? `<div class="text-xs text-gray-400 truncate">@${p.username}</div>` : ''}
                    </div>
                </div>
                `).join('');
            } else {
                list.innerHTML = '<div class="text-center text-gray-500 mt-10 text-sm">Подписки отсутствуют</div>';
            }
        } catch (e) {
            console.error(e);
            list.innerHTML = '<div class="text-center text-red-500 mt-10 text-sm">Ошибка загрузки подписок</div>';
        }
    } else {
        list.innerHTML = '<div class="text-center text-gray-500 mt-10 text-sm">У вас пока нет подписок</div>';
    }
}
(window as any).openShortsSubscriptions = openShortsSubscriptions;

export function closeShortsSubscriptions() {
    if (window.location.hash === '#shorts-subscriptions') {
        window.history.back();
    } else {
        const overlay = document.getElementById('shorts-subscriptions-overlay');
        if (overlay) overlay.classList.add('hidden');
        if (activeVideo && document.getElementById('shorts-screen')?.classList.contains('hidden') === false) {
            activeVideo.play().catch(e => console.log(e));
        } else if (document.getElementById('shorts-screen')?.classList.contains('hidden') === false) {
            // "Выкидывать обратно в общую ленту"
            // Because shorts-screen is technically the background here.
            // if we are displaying subscriptions from somewhere else we can call openShorts.
        }
    }
}
(window as any).closeShortsSubscriptions = closeShortsSubscriptions;

export function navigateToUserFromSubscriptions(userId: string) {
    if (window.location.hash === '#shorts-subscriptions') {
        window.history.replaceState({ type: 'shorts_analytics', userId }, '', '#shorts-analytics');
    } else {
        window.history.pushState({ type: 'shorts_analytics', userId }, '', '#shorts-analytics');
    }
    const search = document.getElementById('shorts-subscriptions-overlay');
    if (search) search.classList.add('hidden');
    _doViewUserShorts(userId);
}
(window as any).navigateToUserFromSubscriptions = navigateToUserFromSubscriptions;

export function navigateToUserFromSearch(userId: string) {
    if (window.location.hash === '#shorts-search') {
        window.history.replaceState({ type: 'shorts_analytics', userId }, '', '#shorts-analytics');
    } else {
        window.history.pushState({ type: 'shorts_analytics', userId }, '', '#shorts-analytics');
    }
    const search = document.getElementById('shorts-search-overlay');
    if (search) search.classList.add('hidden');
    _doViewUserShorts(userId);
}
(window as any).navigateToUserFromSearch = navigateToUserFromSearch;

export function navigateToShortFromSearch(shortId: string) {
    if (window.location.hash === '#shorts-search') {
        window.history.replaceState({ type: 'shorts', shortId }, '', '#shorts');
    } else {
        window.history.pushState({ type: 'shorts', shortId }, '', '#shorts');
    }
    const search = document.getElementById('shorts-search-overlay');
    if (search) search.classList.add('hidden');
    openShorts(shortId);
}
(window as any).navigateToShortFromSearch = navigateToShortFromSearch;

export function setShortsSearchFilter(filter: 'videos' | 'channels') {
    currentSearchFilter = filter;
    
    const vBtn = document.getElementById('shorts-filter-videos');
    const cBtn = document.getElementById('shorts-filter-channels');
    
    if (filter === 'videos') {
        vBtn?.className.replace('bg-[#222222]', 'bg-white').replace('text-white', 'text-black');
        vBtn?.classList.add('bg-white', 'text-black');
        vBtn?.classList.remove('bg-[#222222]', 'text-white');
        
        cBtn?.classList.add('bg-[#222222]', 'text-white');
        cBtn?.classList.remove('bg-white', 'text-black');
    } else {
        cBtn?.classList.add('bg-white', 'text-black');
        cBtn?.classList.remove('bg-[#222222]', 'text-white');
        
        vBtn?.classList.add('bg-[#222222]', 'text-white');
        vBtn?.classList.remove('bg-white', 'text-black');
    }
    
    const input = document.getElementById('shorts-search-full-input') as HTMLInputElement;
    performFullShortsSearch(input?.value || '');
}
(window as any).setShortsSearchFilter = setShortsSearchFilter;

let fullSearchTimeout: any = null;
export function performFullShortsSearch(query: string) {
    if (fullSearchTimeout) clearTimeout(fullSearchTimeout);
    
    const list = document.getElementById('shorts-search-results-list');
    if (!list) return;
    
    if (!query || query.trim().length === 0) {
        list.innerHTML = '<div class="text-center text-gray-500 mt-10 text-sm">Введите запрос для поиска</div>';
        return;
    }
    
    list.innerHTML = '<div class="text-center py-10"><div class="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div></div>';
    
    fullSearchTimeout = setTimeout(async () => {
        try {
            const q = query.toLowerCase();
            
            if (currentSearchFilter === 'videos') {
                const { data } = await supabase
                    .from('shorts')
                    .select('*, profiles:author_id(display_name, username, avatar_url, is_premium, premium_until)')
                    .order('created_at', { ascending: false })
                    .limit(50);
                
                let matches = data || [];
                matches = matches.filter(s => {
                    const desc = (s.description || '').toLowerCase();
                    const title = (s.title || '').toLowerCase();
                    return desc.includes(q) || title.includes(q);
                });
                
                if (matches.length > 0) {
                    list.innerHTML = matches.map(s => {
                        const authorName = s.profiles?.display_name || s.profiles?.username || '';
                        return `
                        <div class="flex gap-3 p-3 hover:bg-[#222222] cursor-pointer transition select-none" onclick="window.navigateToShortFromSearch('${s.id}')">
                            <div class="w-24 h-32 bg-gray-800 rounded-lg shrink-0 overflow-hidden relative">
                                <video src="${s.video_url}#t=0.1" class="w-full h-full object-cover"></video>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="font-bold text-sm text-white line-clamp-2 leading-tight">${s.title || 'Без названия'}</div>
                                <div class="text-xs text-gray-400 mt-1">${s.views_count || 0} просмотров</div>
                                <div class="flex items-center gap-1.5 mt-2">
                                    <div class="w-5 h-5 rounded-full overflow-hidden bg-gray-600 shrink-0">
                                        ${s.profiles?.avatar_url ? `<img src="${s.profiles.avatar_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center font-bold text-[8px] text-white">${authorName[0]?.toUpperCase() || '?'}</div>`}
                                    </div>
                                    <div class="text-xs text-gray-400 truncate">${authorName}</div>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('');
                } else {
                    list.innerHTML = '<div class="text-center text-gray-500 mt-10 text-sm">Ничего не найдено</div>';
                }
            } else {
                // Channels
                const { data } = await supabase
                    .from('profiles')
                    .select('*')
                    .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
                    .limit(50);
                    
                if (data && data.length > 0) {
                    list.innerHTML = data.map(p => {
                        const isPremiumUser = p.is_premium && (!p.premium_until || new Date(p.premium_until) > new Date());
                        return `
                    <div class="flex items-center gap-3 p-4 hover:bg-[#222222] cursor-pointer transition select-none border-b border-[#222222]" onclick="window.navigateToUserFromSearch('${p.id}')">
                        <div class="w-12 h-12 relative rounded-full shrink-0">
                            <div class="w-full h-full rounded-full overflow-hidden bg-gray-700">
                                ${p.avatar_url ? `<img src="${p.avatar_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center font-bold text-sm text-white">${(p.display_name || p.username || '?')[0].toUpperCase()}</div>`}
                            </div>
                            ${isPremiumUser ? `<div class="absolute -bottom-1 -right-1 bg-[#111111] rounded-full p-0.5 shadow-sm border border-[#222222] z-50 w-5 h-5 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : ''}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-white text-sm truncate">${p.display_name || p.username}</div>
                            ${p.username ? `<div class="text-xs text-gray-400 truncate">@${p.username}</div>` : ''}
                        </div>
                    </div>
                    `}).join('');
                } else {
                    list.innerHTML = '<div class="text-center text-gray-500 mt-10 text-sm">Каналы не найдены</div>';
                }
            }
        } catch(e) {
            console.error(e);
            list.innerHTML = '<div class="text-center text-red-500 mt-10 text-sm">Ошибка поиска</div>';
        }
    }, 400);
}
(window as any).performFullShortsSearch = performFullShortsSearch;

export async function viewUserShorts(userId?: string) {
    const targetId = userId || state.currentUser!.id;
    if (window.location.hash !== '#shorts-analytics') {
        window.history.pushState({ type: 'shorts_analytics', userId: targetId }, '', '#shorts-analytics');
    } else {
        window.history.replaceState({ type: 'shorts_analytics', userId: targetId }, '', '#shorts-analytics');
    }
    await _doViewUserShorts(targetId);
}
(window as any).viewUserShorts = viewUserShorts;

async function _doViewUserShorts(targetId: string) {
    const screen = document.getElementById('shorts-analytics-screen');
    if (!screen) return;
    screen.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    pauseAllVideos();
    
    const grid = document.getElementById('analytics-grid')!;
    grid.innerHTML = '<div class="col-span-3 py-10 text-center text-gray-500"><div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div></div>';
    
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', targetId).single();
    if (profile) {
        const isPremiumUser = profile.is_premium && (!profile.premium_until || new Date(profile.premium_until) > new Date());
        const premiumBadgeHtml = isPremiumUser ? `<div class="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm border border-gray-200 dark:border-gray-700 z-50 w-6 h-6 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : '';
        let avatarStr = profile.avatar_url ? `<img src="${profile.avatar_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold">${(profile.display_name || profile.username || '?')[0].toUpperCase()}</div>`;
        document.getElementById('analytics-avatar')!.innerHTML = `<div class="w-full h-full relative rounded-full overflow-hidden">${avatarStr}</div>${premiumBadgeHtml}`;
        document.getElementById('analytics-avatar')!.classList.remove('overflow-hidden'); // The badge needs to overflow the main container
        document.getElementById('analytics-name')!.innerText = profile.display_name || profile.username;
        
        const subContainer = document.getElementById('analytics-subscribe-container');
        if (subContainer) {
            if (targetId !== state.currentUser?.id) {
                const subs = state.currentProfile?.settings?.subscriptions || [];
                const isSub = subs.includes(targetId);
                subContainer.innerHTML = `<button id="subscribe-btn-analytics-${targetId}" onclick="window.toggleSubscription('${targetId}', true)" class="px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${isSub ? 'bg-gray-700 text-gray-200' : 'bg-white text-black'} shadow-sm">${isSub ? 'Вы подписаны' : 'Подписаться'}</button>`;
            } else {
                subContainer.innerHTML = '';
            }
        }
    }
    
    const { data: userShorts } = await supabase.from('shorts').select('*').eq('author_id', targetId).order('created_at', { ascending: false }).limit(100);
    
    document.getElementById('analytics-stats')!.innerText = `${userShorts?.length || 0} публикаций`;
    
    const isOwner = state.currentUser ? targetId === state.currentUser.id : false;
    
    if (userShorts && userShorts.length > 0) {
        grid.innerHTML = userShorts.map(s => `
            <div id="analytics-short-${s.id}" class="aspect-[9/16] relative group bg-gray-800 overflow-hidden rounded-lg transition-all duration-200 select-none">
                <div class="absolute inset-0 cursor-pointer" onclick="window.openShorts('${s.id}', '${targetId}')"></div>
                <video src="${s.video_url}" class="w-full h-full object-cover pointer-events-none" preload="metadata"></video>
                <div class="absolute inset-0 bg-black/20 flex flex-col justify-end p-2 opacity-100 pointer-events-none">
                    <div class="flex items-center gap-1 text-white text-[10px] font-bold drop-shadow-md pb-1">
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                        ${s.likes_count || 0}
                    </div>
                    <div class="flex items-center gap-1 text-white text-[10px] font-bold drop-shadow-md">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                        ${s.views_count || 0}
                    </div>
                </div>
                ${isOwner ? `
                <div class="absolute top-1 right-1 z-[15] opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="p-1.5 bg-red-600/90 hover:bg-red-500 text-white rounded-full transition-colors drop-shadow" onclick="event.stopPropagation(); if(confirm('Удалить это видео?')) window.deleteShort('${s.id}')">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
                ` : ''}
            </div>
        `).join('');
    } else {
        grid.innerHTML = '<div class="col-span-3 py-10 text-center text-gray-500">Нет публикаций</div>';
    }
}
(window as any).viewUserShorts = viewUserShorts;

export function closeShortsAnalytics() {
    if (window.location.hash === '#shorts-analytics') {
        window.history.back();
    } else {
        document.getElementById('shorts-analytics-screen')?.classList.add('hidden');
        const shortsScreen = document.getElementById('shorts-screen');
        if (shortsScreen && shortsScreen.classList.contains('hidden') === false) {
             if (activeVideo) activeVideo.play().catch(e=>console.log(e));
        } else if (shortsScreen) {
             shortsScreen.classList.remove('hidden');
             document.body.style.overflow = 'hidden';
        }
    }
}
(window as any).closeShortsAnalytics = closeShortsAnalytics;

export function closeShorts() {
    if (window.location.hash.startsWith('#shorts')) {
        window.location.hash = ''; // Clear all shorts modal hashes
    } else {
        const screen = document.getElementById('shorts-screen');
        if (screen) screen.classList.add('hidden');
        document.body.style.overflow = '';
        pauseAllVideos();
    }
}
(window as any).closeShorts = closeShorts;

async function updateCountersDynamically(shortId: string) {
    try {
        const { count: likesCount } = await supabase.from('short_likes').select('*', { count: 'exact', head: true }).eq('short_id', shortId);
        if (likesCount !== null) {
            const likesEl = document.getElementById(`short-likes-count-${shortId}`);
            if (likesEl) likesEl.innerText = likesCount.toString();
        }
        
        const { count: commentsCount } = await supabase.from('short_comments').select('*', { count: 'exact', head: true }).eq('short_id', shortId);
        if (commentsCount !== null) {
            const commentsEl = document.getElementById(`short-comments-count-${shortId}`);
            if (commentsEl) commentsEl.innerText = commentsCount.toString();
        }
        
        const { data: shortData } = await supabase.from('shorts').select('views_count').eq('id', shortId).single();
        if (shortData) {
            const viewsEl = document.getElementById(`short-views-count-${shortId}`);
            if (viewsEl) viewsEl.innerText = shortData.views_count?.toString() || '0';
        }
        
        // Also check if current user liked it (they might have liked via another device)
        if (state.currentUser) {
            const { data: likeData } = await supabase.from('short_likes').select('id').eq('short_id', shortId).eq('user_id', state.currentUser.id).single();
            const uiLikeBtn = document.getElementById(`short-like-btn-${shortId}`);
            if (uiLikeBtn) {
                if (likeData) {
                    uiLikeBtn.classList.add('text-red-500');
                    uiLikeBtn.classList.remove('text-white');
                    uiLikeBtn.querySelector('svg')!.setAttribute('fill', 'currentColor');
                } else {
                    uiLikeBtn.classList.remove('text-red-500');
                    uiLikeBtn.classList.add('text-white');
                    uiLikeBtn.querySelector('svg')!.setAttribute('fill', 'none');
                }
            }
        }
    } catch(e) {}
}

let shortsQueue: any[] = [];
let loadedShortIds = new Set<string>();
let isLoadingMoreShorts = false;
let shortsObserver: IntersectionObserver | null = null;
let currentAuthorFilterId: string | undefined = undefined;

async function fetchShortsBatch(initialShortId?: string, authorFilterId?: string) {
    try {
        const { data: viewedRecords } = await supabase.from('short_views').select('short_id').eq('user_id', state.currentUser!.id);
        const viewedSet = new Set(viewedRecords?.map(v => v.short_id) || []);
        
        const { data: myLikedShorts } = await supabase.from('short_likes').select('shorts(title, description)').eq('user_id', state.currentUser!.id).limit(50);
        let preferredWords = new Set<string>();
        if (myLikedShorts) {
            myLikedShorts.forEach(item => {
                const s = item.shorts as any;
                if (s) {
                    const words = `${s.title || ''} ${s.description || ''}`.toLowerCase().split(/[\s\.,?!]+/) || [];
                    words.forEach(w => { if (w.length > 3) preferredWords.add(w) });
                }
            });
        }

        let query = supabase
            .from('shorts')
            .select(`*, profiles:author_id(display_name, username, avatar_url, is_premium, premium_until)`);
            
        if (authorFilterId) {
            if (authorFilterId === 'subscriptions') {
                const subs = state.currentProfile?.settings?.subscriptions || [];
                if (subs.length > 0) {
                    query = query.in('author_id', subs).order('created_at', { ascending: false }).limit(200);
                } else {
                    // Empty list if no subs
                    return [];
                }
            } else {
                query = query.eq('author_id', authorFilterId).order('created_at', { ascending: false }).limit(200);
            }
        } else {
            query = query.order('created_at', { ascending: false }).limit(200);
        }

        const { data: shorts, error } = await query;
            
        if (error) throw error;
        
        let allShorts = shorts || [];
        
        if (initialShortId && !allShorts.find(s => s.id === initialShortId)) {
            const { data: initialShort } = await supabase
                .from('shorts')
                .select(`*, profiles:author_id(display_name, username, avatar_url, is_premium, premium_until)`)
                .eq('id', initialShortId)
                .single();
            if (initialShort) {
                allShorts.push(initialShort);
            }
        }
        
        // Exclude already loaded ones to prevent looping duplicates in same session
        allShorts = allShorts.filter(s => !loadedShortIds.has(s.id));
        
        if (authorFilterId) {
             // Keep strictly in channel order (chronological, descending), handled by DB order but just to be sure we don't mess it up
             allShorts.forEach((s, i) => s._sortScore = -i);
             allShorts.sort((a, b) => b._sortScore - a._sortScore);
        } else {
            // Scoring system
            allShorts.forEach(s => {
                let score = 0;
                
                // Popularity (Logarithmic so megahits don't dominate forever)
                score += Math.log10((s.likes_count || 0) * 10 + (s.views_count || 0) + 1) * 15;
                
                // Freshness (Up to 30 points for being very new)
                const daysOld = (Date.now() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24);
                score += Math.max(0, 30 - daysOld * 2);
                
                // Topic match
                const words = `${s.title || ''} ${s.description || ''}`.toLowerCase().split(/[\s\.,?!]+/) || [];
                let matchCount = 0;
                words.forEach(w => {
                    if (preferredWords.has(w)) matchCount++;
                });
                score += Math.min(matchCount * 5, 40); // Max 40 points for topic match
                
                // Seen penalty (we still show them eventually if out of fresh videos)
                if (viewedSet.has(s.id)) {
                    score -= 1000;
                }
                
                // Jitter for variety every load
                score += Math.random() * 30;
                
                s._sortScore = score;
            });
            
            allShorts.sort((a, b) => b._sortScore - a._sortScore);
        }
        
        let newBatch = [...allShorts];

        if (initialShortId && !loadedShortIds.has(initialShortId)) {
            const tgtIdx = newBatch.findIndex(s => s.id === initialShortId);
            if (tgtIdx !== -1) {
                const [tgt] = newBatch.splice(tgtIdx, 1);
                newBatch.unshift(tgt);
            }
        }
        
        return newBatch;
    } catch(e) {
        console.error(e);
        return [];
    }
}

async function loadShorts(initialShortId?: string, authorFilterId?: string) {
    const container = document.getElementById('shorts-container');
    if (!container) return;
    
    currentAuthorFilterId = authorFilterId;
    
    const subBar = document.getElementById('shorts-subscriptions-bar');
    if (subBar) {
        if (authorFilterId === 'subscriptions') {
            subBar.classList.remove('hidden');
            const subs = state.currentProfile?.settings?.subscriptions || [];
            if (subs.length > 0) {
                const { data: subProfiles } = await supabase.from('profiles').select('id, display_name, username, avatar_url').in('id', subs);
                if (subProfiles) {
                    subBar.innerHTML = subProfiles.map(p => {
                        const avatarStr = p.avatar_url ? `<img src="${p.avatar_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white">${(p.display_name || p.username || '?')[0].toUpperCase()}</div>`;
                        return `<div class="flex flex-col items-center gap-1 cursor-pointer shrink-0" onclick="window.viewUserShorts('${p.id}')">
                            <div class="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white/20 hover:ring-blue-500 transition-all">${avatarStr}</div>
                            <div class="text-[10px] text-white w-14 truncate text-center font-bold drop-shadow-md">${p.display_name || p.username}</div>
                        </div>`;
                    }).join('');
                }
            } else {
                subBar.innerHTML = '';
            }
        } else {
            subBar.classList.add('hidden');
            subBar.innerHTML = '';
        }
    }
    
    container.innerHTML = '<div class="flex h-full items-center justify-center"><div class="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>';
    
    if (!navigator.onLine) {
        container.innerHTML = `<div class="flex flex-col h-full items-center justify-center p-8 text-center text-gray-400">Нет подключения к интернету.</div>`;
        return;
    }
    
    loadedShortIds.clear();
    shortsQueue = await fetchShortsBatch(initialShortId, authorFilterId);
    shortsList = [];
    
    if (shortsQueue.length === 0) {
        if (authorFilterId === 'subscriptions') {
            container.innerHTML = '<div class="flex flex-col gap-4 h-full items-center justify-center text-gray-400 font-medium px-6 text-center"><svg class="w-16 h-16 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg><span>У вас пока нет подписок на авторов или они не выкладывали видео.</span><button onclick="window.openShorts()" class="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-colors font-bold shadow-lg">Смотреть общую ленту</button></div>';
        } else {
            container.innerHTML = '<div class="flex h-full items-center justify-center text-gray-400 font-medium">Нет видео... Но вы можете стать первыми!</div>';
        }
        return;
    }
    
    container.innerHTML = '';
    appendShortsFromQueue(3);
}

async function loadMoreShorts() {
    if (isLoadingMoreShorts) return;
    isLoadingMoreShorts = true;
    
    if (shortsQueue.length < 5) {
        const more = await fetchShortsBatch(undefined, currentAuthorFilterId);
        shortsQueue.push(...more);
    }
    
    if (shortsQueue.length > 0) {
        appendShortsFromQueue(3);
    }
    
    isLoadingMoreShorts = false;
}

function appendShortsFromQueue(count: number) {
    const container = document.getElementById('shorts-container');
    if (!container) return;
    
    const toAppend = shortsQueue.splice(0, count);
    if (toAppend.length === 0) return;
    
    const startIndex = shortsList.length;
    shortsList.push(...toAppend);
    toAppend.forEach(s => loadedShortIds.add(s.id));
    
    // Fetch likes for these new shorts
    supabase.from('short_likes').select('short_id').eq('user_id', state.currentUser!.id).in('short_id', toAppend.map(s => s.id))
    .then(({ data: myLikes }) => {
        const myLikedIds = new Set(myLikes?.map(l => l.short_id));
        
        toAppend.forEach((short, i) => {
            const index = startIndex + i;
            const isLiked = myLikedIds.has(short.id);
            const name = short.profiles?.display_name || short.profiles?.username || 'Неизвестный';
            let avatarStr = '';
            const isPremiumUser = short.profiles?.is_premium && (!short.profiles?.premium_until || new Date(short.profiles.premium_until) > new Date());
            const premiumBadgeHtml = isPremiumUser ? `<div class="absolute -bottom-1 -right-1 bg-black/60 backdrop-blur rounded-full p-0.5 shadow-sm border border-gray-700 z-50 w-4 h-4 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : '';
            
            if (short.profiles?.avatar_url) {
                avatarStr = `<div class="w-full h-full relative"><img src="${short.profiles.avatar_url}" class="w-full h-full object-cover rounded-full select-none" draggable="false">${premiumBadgeHtml}</div>`;
            } else {
                avatarStr = `<div class="w-full h-full relative"><div class="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center font-bold text-white shadow-sm select-none overflow-hidden">${name[0].toUpperCase()}</div>${premiumBadgeHtml}</div>`;
            }
            
            const isPreloaded = i < 3;
            const shortHTML = `
            <div class="short-video-wrapper w-full h-full snap-start relative bg-black flex items-center justify-center overflow-hidden" data-index="${index}" data-id="${short.id}">
                <video ${isPreloaded ? `src="${short.video_url}" preload="auto"` : `data-src="${short.video_url}" preload="metadata"`} loop playsinline class="max-w-full max-h-full object-contain cursor-pointer" onclick="window.togglePlayShort(this)"></video>
                
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none"></div>
                
                <div class="absolute bottom-6 left-4 right-20 z-20 pointer-events-none flex flex-col justify-end">
                    <div class="flex items-center gap-3 mb-2 pointer-events-auto">
                        <div class="cursor-pointer flex items-center gap-2" onclick="window.viewUserShorts('${short.author_id}');">
                            <div class="w-10 h-10 shrink-0 ring-2 ring-white/20 rounded-full">${avatarStr}</div>
                            <span class="font-bold text-white text-base drop-shadow-md">${name}</span>
                        </div>
                        ${short.author_id !== state.currentUser?.id ? (() => {
                            const subs = state.currentProfile?.settings?.subscriptions || [];
                            const isSub = subs.includes(short.author_id);
                            return `<button id="subscribe-btn-${short.author_id}" onclick="window.toggleSubscription('${short.author_id}')" class="ml-2 px-3 py-1 rounded-full text-xs font-bold transition-colors ${isSub ? 'bg-gray-700 text-gray-200' : 'bg-white text-black'} shadow-sm">${isSub ? 'Вы подписаны' : 'Подписаться'}</button>`;
                        })() : ''}
                    </div>
                    ${short.title ? `<h3 class="font-bold text-white text-lg drop-shadow-md pointer-events-auto cursor-pointer line-clamp-2" onclick="window.openShortDescription('${short.id}')">${short.title}</h3>` : `<h3 class="font-bold text-white text-lg drop-shadow-md pointer-events-auto cursor-pointer line-clamp-2" onclick="window.openShortDescription('${short.id}')">Без названия</h3>`}
                </div>
                
                <div class="absolute bottom-6 right-2 flex flex-col gap-6 items-center z-20">
                    <button class="flex flex-col items-center gap-1 ${isLiked ? 'text-red-500' : 'text-white'} drop-shadow-md transition-transform hover:scale-110 group" id="short-like-btn-${short.id}" onclick="window.toggleLikeShort('${short.id}')">
                        <div class="p-2 rounded-full bg-black/20 group-hover:bg-black/40 backdrop-blur-sm transition-colors">
                            <svg class="w-8 h-8 transition-colors" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                        </div>
                        <span class="text-xs font-bold text-white" id="short-likes-count-${short.id}">${short.likes_count || 0}</span>
                    </button>
                    
                    <button class="flex flex-col items-center gap-1 text-white drop-shadow-md transition-transform hover:scale-110 group" onclick="window.openShortComments('${short.id}')">
                        <div class="p-2 rounded-full bg-black/20 group-hover:bg-black/40 backdrop-blur-sm transition-colors">
                            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                        </div>
                        <span class="text-xs font-bold" id="short-comments-count-${short.id}">${short.comments_count || 0}</span>
                    </button>

                    <div class="flex flex-col items-center gap-1 text-white drop-shadow-md group">
                        <div class="p-2 rounded-full bg-black/20 backdrop-blur-sm transition-colors">
                            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                        </div>
                        <span class="text-xs font-bold" id="short-views-count-${short.id}">${short.views_count || 0}</span>
                    </div>
                </div>
                
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 transition-opacity duration-300" id="play-pause-icon-${index}">
                </div>
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 z-10 bg-black" id="buffering-icon-${index}">
                    <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            </div>
            `;
            
            const div = document.createElement('div');
            div.innerHTML = shortHTML.trim();
            const element = div.firstChild as HTMLElement;
            container.appendChild(element);
            
            if (!shortsObserver) setupShortsObserver();
            shortsObserver.observe(element);
            
            const video = element.querySelector('video');
            const bufferingIcon = element.querySelector(`#buffering-icon-${index}`) as HTMLElement;
            
            if (video && bufferingIcon) {
                video.addEventListener('waiting', () => {
                    bufferingIcon.style.opacity = '1';
                    bufferingIcon.classList.remove('bg-black');
                });
                video.addEventListener('playing', () => {
                    bufferingIcon.style.opacity = '0';
                    bufferingIcon.classList.remove('bg-black'); // remove black bg after first load
                });
                video.addEventListener('canplay', () => {
                    bufferingIcon.style.opacity = '0';
                    bufferingIcon.classList.remove('bg-black');
                });
                video.addEventListener('loadstart', () => {
                    bufferingIcon.style.opacity = '1';
                    bufferingIcon.classList.add('bg-black'); // show black bg initially
                });
            }
        });
    });
}

function setupShortsObserver() {
    shortsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video') as HTMLVideoElement;
            const shortId = (entry.target as HTMLElement).dataset.id;
            const index = parseInt((entry.target as HTMLElement).dataset.index || '0', 10);
            
            if (entry.isIntersecting) {
                // Unload videos that are > 3 positions away
                document.querySelectorAll('.short-video-wrapper video').forEach(v => {
                    const vidElement = v as HTMLVideoElement;
                    const parentIndex = parseInt(vidElement.closest('.short-video-wrapper')?.getAttribute('data-index') || '0', 10);
                    if (Math.abs(parentIndex - index) > 3) {
                        if (vidElement.src) {
                            vidElement.removeAttribute('src');
                            vidElement.load();
                        }
                    } else if (!vidElement.src && vidElement.dataset.src) {
                        vidElement.src = vidElement.dataset.src;
                        vidElement.load();
                    }
                });
                
                // If we're near the end of the loaded list, load more
                if (index >= shortsList.length - 2) {
                    loadMoreShorts();
                }
                
                video?.play().catch(e => console.log("Autoplay prevented"));
                activeVideo = video;
                if (shortId) {
                    recordView(shortId);
                    updateCountersDynamically(shortId);
                }
            } else {
                video?.pause();
                if (video) video.currentTime = 0;
            }
        });
    }, { threshold: 0.6 });
}

const recordedViews = new Set<string>();
async function recordView(shortId: string) {
    if (recordedViews.has(shortId) || !state.currentUser) return;
    recordedViews.add(shortId);
    try {
        const { error } = await supabase.from('short_views').insert({ short_id: shortId, user_id: state.currentUser.id });
        if (!error) {
            // New view successfully recorded
            const uiViews = document.getElementById(`short-views-count-${shortId}`);
            if (uiViews) uiViews.innerText = (parseInt(uiViews.innerText || '0') + 1).toString();
            
            const { data } = await supabase.from('shorts').select('views_count').eq('id', shortId).single();
            if (data) {
                await supabase.from('shorts').update({ views_count: (data.views_count || 0) + 1 }).eq('id', shortId);
            }
        }
    } catch(e) {}
}

(window as any).toggleSubscription = async (authorId: string, isAnalytics = false) => {
    if (!state.currentUser) return;
    try {
        const btn = document.getElementById(`subscribe-btn-${authorId}`);
        const analyticsBtn = document.getElementById(`subscribe-btn-analytics-${authorId}`);
        
        let settings = state.currentProfile?.settings || {};
        let subs = settings.subscriptions || [];
        
        const isSubscribed = subs.includes(authorId);
        
        if (isSubscribed) {
            subs = subs.filter((id: string) => id !== authorId);
            if (btn) {
                btn.innerText = 'Подписаться';
                btn.classList.remove('bg-gray-700', 'text-gray-200');
                btn.classList.add('bg-white', 'text-black');
            }
            if (analyticsBtn) {
                analyticsBtn.innerText = 'Подписаться';
                analyticsBtn.classList.remove('bg-gray-700', 'text-gray-200');
                analyticsBtn.classList.add('bg-white', 'text-black');
            }
        } else {
            subs.push(authorId);
            if (btn) {
                btn.innerText = 'Вы подписаны';
                btn.classList.remove('bg-white', 'text-black');
                btn.classList.add('bg-gray-700', 'text-gray-200');
            }
            if (analyticsBtn) {
                analyticsBtn.innerText = 'Вы подписаны';
                analyticsBtn.classList.remove('bg-white', 'text-black');
                analyticsBtn.classList.add('bg-gray-700', 'text-gray-200');
            }
        }
        
        settings.subscriptions = subs;
        if (state.currentProfile) state.currentProfile.settings = settings;
        await supabase.from('profiles').update({ settings }).eq('id', state.currentUser.id);
    } catch(e) {
        console.error('Subscription error', e);
    }
};

(window as any).openShortDescription = (shortId: string) => {
    const short = shortsList.find(s => s.id === shortId);
    if (!short) return;
    
    const modal = document.getElementById('shorts-description-modal');
    const content = document.getElementById('shorts-description-content');
    if (!modal || !content) return;
    
    // Format date like YouTube (e.g., 5 апр. 2024 г.)
    const uploadDate = new Date(short.created_at).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
    
    content.innerHTML = `
        <div class="mb-4">
            <h2 class="text-xl font-bold mb-2">${short.title || 'Без названия'}</h2>
            <div class="flex items-center gap-4 text-gray-400 text-sm mb-4 font-medium border-b border-gray-800 pb-4">
                <span>Просмотров: ${short.views_count || 0}</span>
                <span>${uploadDate}</span>
            </div>
            <p class="text-base text-gray-200 whitespace-pre-wrap leading-relaxed break-words" style="word-break: break-word;">${short.description || 'Описание отсутствует.'}</p>
        </div>
    `;
    
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            modal.classList.remove('translate-y-full');
        });
    });
};

(window as any).closeShortDescription = () => {
    const modal = document.getElementById('shorts-description-modal');
    if (modal) {
        modal.classList.add('translate-y-full');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

(window as any).toggleLikeShort = async (shortId: string) => {
    if (!state.currentUser) return;
    
    const uiLikeBtn = document.getElementById(`short-like-btn-${shortId}`);
    const isLiked = uiLikeBtn?.classList.contains('text-red-500');
    const uiLikesCount = document.getElementById(`short-likes-count-${shortId}`);
    const count = parseInt(uiLikesCount?.innerText || '0');

    try {
        if (isLiked) {
            // Unlike
            await supabase.from('short_likes').delete().eq('short_id', shortId).eq('user_id', state.currentUser.id);
            if (uiLikesCount) uiLikesCount.innerText = Math.max(0, count - 1).toString();
            if (uiLikeBtn) {
                uiLikeBtn.classList.remove('text-red-500');
                uiLikeBtn.classList.add('text-white');
                uiLikeBtn.querySelector('svg')!.setAttribute('fill', 'none');
            }
            const { data } = await supabase.from('shorts').select('likes_count').eq('id', shortId).single();
            if (data) {
                const { error } = await supabase.from('shorts').update({ likes_count: Math.max(0, (data.likes_count || 0) - 1) }).eq('id', shortId);
                if (error) console.error("Failed to update shorts likes table:", error);
            }
        } else {
            // Like
            await supabase.from('short_likes').insert({ short_id: shortId, user_id: state.currentUser.id });
            if (uiLikesCount) uiLikesCount.innerText = (count + 1).toString();
            if (uiLikeBtn) {
                uiLikeBtn.classList.add('text-red-500');
                uiLikeBtn.classList.remove('text-white');
                uiLikeBtn.querySelector('svg')!.setAttribute('fill', 'currentColor');
            }
            const { data } = await supabase.from('shorts').select('likes_count').eq('id', shortId).single();
            if (data) {
                const { error } = await supabase.from('shorts').update({ likes_count: (data.likes_count || 0) + 1 }).eq('id', shortId);
                if (error) {
                    console.error("Failed to update shorts likes table:", error);
                    // Silently fail to normal user, but in network we see why
                }
            }
        }
    } catch (e: any) { 
        console.error(e); 
        import('./utils').then(m => m.customAlert("Ошибка при лайке: " + e.message));
    }
};

(window as any).togglePlayShort = (video: HTMLVideoElement) => {
    const parent = video.closest('.short-video-wrapper') as HTMLElement;
    const index = parent?.dataset.index;
    const icon = parent?.querySelector(`[id="play-pause-icon-${index}"]`) as HTMLElement;
    
    if (video.paused) {
        video.play();
        if(icon) {
            icon.style.opacity = '1';
            icon.innerHTML = `<svg class="w-20 h-20 text-white drop-shadow-xl bg-black/30 rounded-full p-4 backdrop-blur-md" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>`;
            setTimeout(() => icon.style.opacity = '0', 500);
        }
    } else {
        video.pause();
        if(icon) {
            icon.style.opacity = '1';
            icon.innerHTML = `<svg class="w-20 h-20 text-white drop-shadow-xl bg-black/30 rounded-full p-4 backdrop-blur-md" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>`;
        }
    }
};

function pauseAllVideos() {
    document.querySelectorAll('#shorts-container video').forEach(v => (v as HTMLVideoElement).pause());
}

(window as any).openShortComments = async (shortId: string) => {
    const modal = document.getElementById('shorts-comments-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    currentShortIdForComments = shortId;
    await loadShortComments(shortId);
};

(window as any).closeShortComments = () => {
    const modal = document.getElementById('shorts-comments-modal');
    if (modal) modal.classList.add('hidden');
    currentShortIdForComments = null;
    replyingToCommentId = null;
    const input = document.getElementById('short-comment-input') as HTMLInputElement;
    if (input) input.placeholder = 'Добавить комментарий...';
};

async function loadShortComments(shortId: string) {
    const list = document.getElementById('shorts-comments-list');
    const title = document.getElementById('comments-count-title');
    if (!list || !title) return;
    
    list.innerHTML = `<div class="text-center text-gray-500 py-4 text-sm">Загрузка...</div>`;
    
    try {
        const { data: comments, error } = await supabase
            .from('short_comments')
            .select(`*, profiles:author_id(display_name, username, avatar_url, is_premium, premium_until)`)
            .eq('short_id', shortId)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        
        title.innerText = `Комментарии (${comments?.length || 0})`;
        
        if (!comments || comments.length === 0) {
            list.innerHTML = `<div class="text-center text-gray-500 py-8 text-sm">Нет комментариев. Будьте первыми!</div>`;
            return;
        }
        
        // Group by parent_id
        const rootComments = comments.filter(c => !c.parent_id);
        const repliesByParent = new Map<string, any[]>();
        comments.filter(c => c.parent_id).forEach(c => {
            if (!repliesByParent.has(c.parent_id)) repliesByParent.set(c.parent_id, []);
            repliesByParent.get(c.parent_id)!.push(c);
        });

        const renderComment = (c: any, isReply: boolean = false) => {
            const name = c.profiles?.display_name || c.profiles?.username || 'Неизвестный';
            const isPremiumUser = c.profiles?.is_premium && (!c.profiles?.premium_until || new Date(c.profiles.premium_until) > new Date());
            const premiumBadgeHtml = isPremiumUser ? `<div class="absolute -top-1 -left-1 bg-black/60 backdrop-blur rounded-full p-0.5 shadow-sm border border-gray-700 z-50 w-3 h-3 flex items-center justify-center"><img src="./image/Google-Gemini-Logo-Transparent.png" class="w-full h-full object-contain" alt="Premium"></div>` : '';
            let avatarStr = '';
            if (c.profiles?.avatar_url) {
                avatarStr = `<div class="w-full h-full relative"><img src="${c.profiles.avatar_url}" class="w-full h-full object-cover rounded-full">${premiumBadgeHtml}</div>`;
            } else {
                avatarStr = `<div class="w-full h-full relative"><div class="w-full h-full bg-slate-600 rounded-full flex items-center justify-center font-bold text-white text-xs overflow-hidden">${name[0].toUpperCase()}</div>${premiumBadgeHtml}</div>`;
            }

            const replies = repliesByParent.get(c.id) || [];
            const repliesHtml = replies.map(r => renderComment(r, true)).join('');
            
            const repliesSection = repliesHtml ? `
                <div class="mt-2 ml-10">
                    <button class="text-blue-500 font-bold text-sm flex items-center gap-1 hover:bg-blue-500/10 px-2 py-1 rounded-full transition-colors" onclick="window.toggleReplies('${c.id}')">
                        <svg class="w-4 h-4 transition-transform duration-200" id="reply-icon-${c.id}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        Показать ответы (${replies.length})
                    </button>
                    <div id="replies-${c.id}" class="hidden relative before:absolute before:left-[-1.5rem] before:top-0 before:bottom-4 before:w-[2px] before:bg-gray-800 ml-4 mt-2">
                        ${repliesHtml}
                    </div>
                </div>
            ` : '';

            return `
                <div class="flex gap-3 mt-4 ${isReply ? 'ml-8 relative before:absolute before:-left-8 before:top-4 before:h-[2px] before:w-6 before:bg-gray-800' : ''}">
                    <div class="w-8 h-8 shrink-0">${avatarStr}</div>
                    <div class="flex-1 min-w-0">
                        <div class="bg-gray-800/40 p-3 rounded-2xl ${isReply ? 'rounded-tl-sm' : 'rounded-tl-sm'}">
                            <div class="flex items-baseline gap-2 mb-1">
                                <span class="font-bold text-sm text-gray-200">${name}</span>
                                <span class="text-xs text-gray-500">${new Date(c.created_at).toLocaleDateString()}</span>
                            </div>
                            <p class="text-sm text-gray-200 whitespace-pre-wrap break-words">${c.content}</p>
                        </div>
                        ${!isReply ? `<button onclick="window.replyToShortComment('${c.id}', '${name}')" class="text-xs text-gray-400 hover:text-white mt-1 ml-2 font-medium">Ответить</button>` : ''}
                    </div>
                </div>
                ${!isReply ? repliesSection : ''}
            `;
        }
        
        list.innerHTML = rootComments.map(c => renderComment(c, false)).join('');
        list.scrollTop = list.scrollHeight;
    } catch (e) {
        list.innerHTML = `<div class="text-center text-red-500 py-4 text-sm">Ошибка загрузки комментариев</div>`;
    }
}

(window as any).toggleReplies = (commentId: string) => {
    const repliesDiv = document.getElementById(`replies-${commentId}`);
    const icon = document.getElementById(`reply-icon-${commentId}`);
    if (repliesDiv && icon) {
        if (repliesDiv.classList.contains('hidden')) {
            repliesDiv.classList.remove('hidden');
            icon.classList.add('rotate-180');
        } else {
            repliesDiv.classList.add('hidden');
            icon.classList.remove('rotate-180');
        }
    }
};

let replyingToCommentId: string | null = null;
(window as any).replyToShortComment = (commentId: string, authorName: string) => {
    replyingToCommentId = commentId;
    const input = document.getElementById('short-comment-input') as HTMLInputElement;
    input.placeholder = `Ответ ${authorName}...`;
    input.focus();
};

(window as any).sendShortComment = async () => {
    if (!currentShortIdForComments || !state.currentUser) return;
    const input = document.getElementById('short-comment-input') as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    
    try {
        await supabase.from('short_comments').insert({
            short_id: currentShortIdForComments,
            author_id: state.currentUser.id,
            content: text,
            parent_id: replyingToCommentId
        });
        
        replyingToCommentId = null;
        input.placeholder = 'Добавить комментарий...';
        
        const countEl = document.getElementById(`short-comments-count-${currentShortIdForComments}`);
        if (countEl) countEl.innerText = (parseInt(countEl.innerText || '0') + 1).toString();
        
        const { data } = await supabase.from('shorts').select('comments_count').eq('id', currentShortIdForComments).single();
        if (data) {
            const { error } = await supabase.from('shorts').update({ comments_count: (data.comments_count || 0) + 1 }).eq('id', currentShortIdForComments);
            if (error) console.error("Failed to update shorts comments_count:", error);
        }
            
        loadShortComments(currentShortIdForComments);
    } catch (e: any) {
        console.error(e);
        import('./utils').then(m => m.customAlert("Ошибка при отправке комментария: " + e.message));
    }
};

let selectedShortFile: File | null = null;
(window as any).openUploadShort = () => {
    const modal = document.getElementById('shorts-upload-modal');
    if (modal) modal.classList.remove('hidden');
    // Pause currently playing short
    if (activeVideo && !activeVideo.paused) {
        activeVideo.pause();
        const parent = activeVideo.closest('.short-video-wrapper') as HTMLElement;
        const index = parent?.dataset.index;
        const icon = parent?.querySelector(`[id="play-pause-icon-${index}"]`) as HTMLElement;
        if(icon) {
            icon.style.opacity = '1';
            icon.innerHTML = `<svg class="w-20 h-20 text-white drop-shadow-xl bg-black/30 rounded-full p-4 backdrop-blur-md" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>`;
        }
    }
    selectedShortFile = null;
    const prompt = document.getElementById('short-upload-prompt');
    if (prompt) prompt.classList.remove('hidden');
    const progressOverlay = document.getElementById('upload-progress-overlay');
    if (progressOverlay) progressOverlay.className = 'hidden absolute inset-0 bg-gray-900/80 flex-col items-center justify-center z-20 backdrop-blur-sm';
    const titleInput = document.getElementById('short-title-input') as HTMLInputElement;
    if (titleInput) titleInput.value = '';
    (document.getElementById('short-desc-input') as HTMLTextAreaElement).value = '';
    const videoPreview = document.getElementById('short-preview-video');
    if (videoPreview) videoPreview.remove();
    
    // Pause currently playing short
    if (activeVideo && !activeVideo.paused) {
        activeVideo.pause();
        const parent = activeVideo.closest('.short-video-wrapper') as HTMLElement;
        const index = parent?.dataset.index;
        const icon = parent?.querySelector(`[id="play-pause-icon-${index}"]`) as HTMLElement;
        if(icon) {
            icon.style.opacity = '1';
            icon.innerHTML = `<svg class="w-20 h-20 text-white drop-shadow-xl bg-black/30 rounded-full p-4 backdrop-blur-md" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>`;
        }
    }
};

(window as any).closeUploadShort = () => {
    const modal = document.getElementById('shorts-upload-modal');
    if (modal) modal.classList.add('hidden');
};

(window as any).handleShortFileSelect = (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (file.type.indexOf('video') === -1) {
        import('./utils').then(m => m.customToast("Пожалуйста, выберите видео файл"));
        return;
    }
    
    const isPremium = state.currentProfile?.is_premium && (!state.currentProfile.premium_until || new Date(state.currentProfile.premium_until) > new Date());
    const maxSizeMB = isPremium ? 200 : 150;
    
    if (file.size > maxSizeMB * 1024 * 1024) {
        import('./utils').then(m => m.customToast(`Размер видео не должен превышать ${maxSizeMB}МБ.${!isPremium ? ' Приобретите Premium для увеличения лимита до 200МБ!' : ''}`));
        return;
    }
    
    selectedShortFile = file;
    
    const container = document.getElementById('short-preview-container');
    const prompt = document.getElementById('short-upload-prompt');
    if (prompt) prompt.classList.add('hidden');
    
    if (container) {
        let video = document.getElementById('short-preview-video') as HTMLVideoElement;
        if (!video) {
            video = document.createElement('video');
            video.id = 'short-preview-video';
            video.className = 'w-full h-full object-cover rounded-xl z-10';
            video.controls = true;
            video.muted = true;
            container.appendChild(video);
        }
        video.src = URL.createObjectURL(file);
    }
};

(window as any).submitShort = async () => {
    if (!selectedShortFile || !state.currentUser) {
        import('./utils').then(m => m.customAlert("Выберите видео"));
        return;
    }
    
    const titleInput = document.getElementById('short-title-input') as HTMLInputElement;
    const descInput = document.getElementById('short-desc-input') as HTMLTextAreaElement;
    
    const title = titleInput.value.trim() || 'Без названия';
    const desc = descInput.value.trim();
    
    if (title.length > 25) {
        import('./utils').then(m => m.customToast('Название не должно превышать 25 символов'));
        return;
    }
    if (desc.length > 200) {
        import('./utils').then(m => m.customToast('Описание не должно превышать 200 символов'));
        return;
    }

    const btn = document.getElementById('short-submit-btn') as HTMLButtonElement;
    const progressOverlay = document.getElementById('upload-progress-overlay');
    
    try {
        btn.disabled = true;
        btn.innerHTML = 'Загрузка...';
        if (progressOverlay) progressOverlay.className = 'absolute inset-0 bg-gray-900/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm';
        
        const { uploadToCloudinary } = await import('./utils');
        const publicUrl = await uploadToCloudinary(selectedShortFile, false);
        
        const { error: insertError } = await supabase.from('shorts').insert({
            author_id: state.currentUser.id,
            video_url: publicUrl,
            title: title,
            description: desc || null
        });
        
        if (insertError) throw insertError;
        
        import('./utils').then(m => m.customAlert("Видео успешно опубликовано!"));
        (window as any).closeUploadShort();
        
        loadShorts();
        
    } catch(e: any) {
        console.error(e);
        import('./utils').then(m => m.customAlert("Ошибка загрузки: " + e.message));
    } finally {
        if (progressOverlay) progressOverlay.className = 'hidden absolute inset-0 bg-gray-900/80 flex-col items-center justify-center z-20 backdrop-blur-sm';
        btn.disabled = false;
        btn.innerText = 'Опубликовать';
    }
};

export async function deleteShort(shortId: string) {
    if (!state.currentUser) return;
    
    const { data: shortData } = await supabase.from('shorts').select('author_id, video_url').eq('id', shortId).single();
    if (!shortData || shortData.author_id !== state.currentUser.id) return;
    
    const parts = shortData.video_url.split('/');
    const fileName = parts[parts.length - 1].split('?')[0];
    
    // We cannot delete from Cloudinary with unsigned upload, but we just remove the db reference.
    if (fileName && shortData.video_url.includes('supabase.co')) {
        await supabase.storage.from('shorts').remove([fileName]);
    }
    
    // Ensure we delete dependencies first!
    const { error: cErr } = await supabase.from('short_comments').delete().eq('short_id', shortId);
    if (cErr) console.error("Error deleting comments", cErr);
    
    const { error: lErr } = await supabase.from('short_likes').delete().eq('short_id', shortId);
    if (lErr) console.error("Error deleting likes", lErr);
    
    const { error: vErr } = await supabase.from('short_views').delete().eq('short_id', shortId);
    if (vErr) console.error("Error deleting views", vErr);
    
    const { data: delData, error: sErr } = await supabase.from('shorts').delete().eq('id', shortId).select();
    if (sErr) console.error("Error deleting short", sErr);
    
    // Check if it was actually deleted
    const { data: stillExists } = await supabase.from('shorts').select('id').eq('id', shortId).single();
    if (stillExists) {
        import('./utils').then(m => m.customAlert("Ошибка: Недостаточно прав для удаления (необходима политика RLS для DELETE) или есть связанные данные. Шортс скрыт только локально."));
    } else {
        import('./utils').then(m => m.customAlert("Видео успешно удалено."));
    }
    
    // Cleanup lists
    const index = shortsList.findIndex(s => s.id === shortId);
    if (index !== -1) {
        shortsList.splice(index, 1);
    }
    const el = document.querySelector(`.short-video-wrapper[data-id="${shortId}"]`);
    if (el) el.remove();
    
    const analyticsEl = document.getElementById(`analytics-short-${shortId}`);
    if (analyticsEl) analyticsEl.remove();
    
    const statsEl = document.getElementById('analytics-stats');
    if (statsEl) {
        const text = statsEl.innerText;
        const count = parseInt(text, 10);
        if (!isNaN(count)) {
            statsEl.innerText = `${Math.max(0, count - 1)} публикаций`;
        }
    }
}
(window as any).deleteShort = deleteShort;

window.addEventListener('popstate', (e) => {
    const state = e.state;
    const hash = window.location.hash;
    
    // Analytics
    if (hash === '#shorts-analytics') {
        const userId = state?.userId;
        _doViewUserShorts(userId);
    } else {
        document.getElementById('shorts-analytics-screen')?.classList.add('hidden');
    }
    
    // Search
    if (hash === '#shorts-search') {
        const overlay = document.getElementById('shorts-search-overlay');
        if (overlay) overlay.classList.remove('hidden');
        pauseAllVideos();
    } else {
        document.getElementById('shorts-search-overlay')?.classList.add('hidden');
    }

    // Subscriptions
    if (hash === '#shorts-subscriptions') {
        const overlay = document.getElementById('shorts-subscriptions-overlay');
        if (overlay) overlay.classList.remove('hidden');
        pauseAllVideos();
    } else {
        document.getElementById('shorts-subscriptions-overlay')?.classList.add('hidden');
    }
    
    // Main Shorts
    if (hash === '#shorts') {
        const screen = document.getElementById('shorts-screen');
        if (screen && screen.classList.contains('hidden')) {
            screen.classList.remove('hidden');
            if (activeVideo) activeVideo.play().catch(ex=>console.log(ex));
        } else if (!screen) {
            openShorts(state?.shortId, state?.authorId); // load it
        }
    } else {
        const screen = document.getElementById('shorts-screen');
        if (screen && !screen.classList.contains('hidden')) {
            screen.classList.add('hidden');
            pauseAllVideos();
        }
    }
    
    if (hash.startsWith('#shorts')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
});

export async function deleteUserShorts(userId: string) {
    const { data: shorts } = await supabase.from('shorts').select('id, video_url').eq('author_id', userId);
    if (!shorts || shorts.length === 0) return;
    
    const fileNames = shorts.map(s => {
        if (!s.video_url.includes('supabase.co')) return null;
        const parts = s.video_url.split('/');
        return parts[parts.length - 1].split('?')[0];
    }).filter(f => f) as string[];
    
    if (fileNames.length > 0) {
        await supabase.storage.from('shorts').remove(fileNames);
    }
    
    const shortIds = shorts.map(s => s.id);
    
    // Delete related records manually because cascade might not be set up
    await supabase.from('short_comments').delete().in('short_id', shortIds);
    await supabase.from('short_likes').delete().in('short_id', shortIds);
    await supabase.from('short_views').delete().in('short_id', shortIds);
    
    await supabase.from('shorts').delete().in('id', shortIds);
}
