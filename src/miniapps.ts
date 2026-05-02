import { state, supabase } from './supabase';
import { customToast, uploadToCloudinary } from './utils';

export function setupMiniApps() {
    (window as any).openMiniAppsCatalog = openMiniAppsCatalog;
    (window as any).closeMiniAppsCatalog = closeMiniAppsCatalog;
    (window as any).switchMiniAppTab = switchMiniAppTab;
    (window as any).openCreateMiniApp = openCreateMiniApp;
    (window as any).closeCreateMiniApp = closeCreateMiniApp;
    (window as any).submitMiniApp = submitMiniApp;
    (window as any).runMiniApp = runMiniApp;
    (window as any).closeMiniApp = closeMiniApp;
    (window as any).copyMiniAppLink = copyMiniAppLink;
    (window as any).deleteMiniApp = deleteMiniApp;
    (window as any).searchMiniApps = searchMiniApps;
    (window as any).toggleLikeMiniApp = toggleLikeMiniApp;

    (window as any).openEditMiniApp = openEditMiniApp;
    (window as any).closeEditMiniApp = closeEditMiniApp;
    (window as any).submitEditMiniApp = submitEditMiniApp;
    
    (window as any).showAuthorMiniApps = showAuthorMiniApps;
    (window as any).closeAuthorMode = closeAuthorMode;

    // Supabase Real-time updates for mini_apps table
    supabase.channel('public:mini_apps')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mini_apps' }, payload => {
            const newApp = payload.new as any;
            const numEl = document.getElementById(`like-count-${newApp.id}`);
            if (numEl && newApp.likes_count !== undefined) {
                numEl.textContent = String(newApp.likes_count);
            }
            const viewsEl = document.getElementById(`view-count-${newApp.id}`);
            if (viewsEl && newApp.views_count !== undefined) {
                viewsEl.textContent = String(newApp.views_count);
            }
            
            // Update author stats in real-time
            if (currentAuthorFilter && newApp.creator_id === currentAuthorFilter) {
                updateAuthorTotalStats();
            }
        })
        .subscribe();

    // Listen for messages from mini-apps window.parent.postMessage
    window.addEventListener('message', handleMiniAppMessage);
}

let activeTab = 'public';
let currentRunningAppId: string | null = null;
let currentSearchQuery: string = '';
let currentlyEditingAppId: string | null = null;
let currentAuthorFilter: string | null = null;
let currentAuthorName: string | null = null;

export async function openMiniAppsCatalog(skipPushState = false) {
    import('./utils').then(m => m.closeModal(undefined, true));
    if (!skipPushState && window.location.hash !== '#miniapps') {
        window.history.pushState({}, '', '#miniapps');
    }
    const el = document.getElementById('mini-apps-catalog-modal');
    const inner = document.getElementById('mini-apps-catalog-inner');
    if (el && inner) {
        el.classList.remove('hidden');
        setTimeout(() => {
            el.classList.remove('opacity-0');
            inner.classList.remove('scale-95');
            inner.classList.add('scale-100');
        }, 10);
    }
    const searchInput = document.getElementById('miniapp-search-input') as HTMLInputElement;
    if (searchInput) searchInput.value = '';
    currentSearchQuery = '';
    if (currentAuthorFilter) {
        closeAuthorMode();
    } else {
        await loadMiniApps(activeTab);
    }
}

export function closeMiniAppsCatalog() {
    const el = document.getElementById('mini-apps-catalog-modal');
    const inner = document.getElementById('mini-apps-catalog-inner');
    if (el && inner) {
        el.classList.add('opacity-0');
        inner.classList.remove('scale-100');
        inner.classList.add('scale-95');
        setTimeout(() => el.classList.add('hidden'), 300);
    }
}

export function switchMiniAppTab(tab: 'public' | 'favorites' | 'my') {
    activeTab = tab;
    
    document.getElementById('tab-public-apps')!.classList.remove('border-blue-500', 'text-blue-600', 'dark:text-blue-400');
    document.getElementById('tab-public-apps')!.classList.add('border-transparent', 'text-gray-500');
    
    const favTab = document.getElementById('tab-favorites-apps');
    if (favTab) {
        favTab.classList.remove('border-blue-500', 'text-blue-600', 'dark:text-blue-400');
        favTab.classList.add('border-transparent', 'text-gray-500');
    }
    
    document.getElementById('tab-my-apps')!.classList.remove('border-blue-500', 'text-blue-600', 'dark:text-blue-400');
    document.getElementById('tab-my-apps')!.classList.add('border-transparent', 'text-gray-500');

    const activeEl = document.getElementById(`tab-${tab}-apps`);
    if (activeEl) {
        activeEl.classList.remove('border-transparent', 'text-gray-500');
        activeEl.classList.add('border-blue-500', 'text-blue-600', 'dark:text-blue-400');
    }

    const searchContainer = document.getElementById('miniapps-search-container');
    if (searchContainer) {
        if (tab === 'my') {
            searchContainer.classList.add('hidden');
        } else {
            searchContainer.classList.remove('hidden');
        }
    }

    loadMiniApps(tab);
}

export function showAuthorMiniApps(authorId: string, authorName: string) {
    currentAuthorFilter = authorId;
    currentAuthorName = authorName;
    document.getElementById('miniapps-tabs')?.classList.add('hidden');
    
    const searchContainer = document.getElementById('miniapps-search-container');
    if (searchContainer) searchContainer.classList.add('hidden');
    
    const authorHeader = document.getElementById('miniapps-author-header');
    if (authorHeader) {
        authorHeader.classList.remove('hidden');
        authorHeader.classList.add('flex');
    }
    
    const nameEl = document.getElementById('miniapps-author-name');
    if (nameEl) nameEl.textContent = authorName || 'Автор';

    loadMiniApps('public');
}

export function closeAuthorMode() {
    currentAuthorFilter = null;
    document.getElementById('miniapps-tabs')?.classList.remove('hidden');
    
    const authorHeader = document.getElementById('miniapps-author-header');
    if (authorHeader) {
        authorHeader.classList.add('hidden');
        authorHeader.classList.remove('flex');
    }
    
    const searchContainer = document.getElementById('miniapps-search-container');
    if (searchContainer && activeTab !== 'my') searchContainer.classList.remove('hidden');

    loadMiniApps(activeTab);
}

let searchTimeout: any;
export function searchMiniApps(query: string) {
    currentSearchQuery = query;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadMiniApps(activeTab);
    }, 300);
}

export async function toggleLikeMiniApp(appId: string) {
    if (!state.currentUser) return;
    
    const btn = document.getElementById(`like-btn-${appId}`) as HTMLButtonElement;
    if (!btn || btn.disabled) return;
    
    const numEl = document.getElementById(`like-count-${appId}`);
    const currentCount = numEl ? parseInt(numEl.textContent || '0') : 0;
    
    btn.disabled = true;
    const isLiked = btn.dataset.liked === 'true';
    
    try {
        if (isLiked) {
            // Unlike visually first
            btn.dataset.liked = 'false';
            btn.classList.remove('text-red-500');
            btn.classList.add('text-gray-400', 'hover:text-red-500');
            btn.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>`;
            if (numEl) numEl.textContent = String(Math.max(0, currentCount - 1));
            
            const { error } = await supabase.from('mini_apps_likes').delete().eq('app_id', appId).eq('user_id', state.currentUser.id);
            if (error) throw error;
        } else {
            // Like visually first
            btn.dataset.liked = 'true';
            btn.classList.remove('text-gray-400', 'hover:text-red-500');
            btn.classList.add('text-red-500');
            btn.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`;
            if (numEl) numEl.textContent = String(currentCount + 1);
            
            const { error } = await supabase.from('mini_apps_likes').insert({ app_id: appId, user_id: state.currentUser.id });
            if (error) throw error;
        }
    } catch (e: any) {
        console.error('Like toggle error', e);
        // revert visually
        btn.dataset.liked = String(isLiked);
        if (isLiked) {
             btn.classList.add('text-red-500');
             btn.classList.remove('text-gray-400', 'hover:text-red-500');
             btn.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`;
        } else {
             btn.classList.remove('text-red-500');
             btn.classList.add('text-gray-400', 'hover:text-red-500');
             btn.innerHTML = `<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>`;
        }
        if (numEl) numEl.textContent = String(currentCount);
        import('./utils').then(m => m.customToast(`Ошибка: ${e.message}`));
    } finally {
        btn.disabled = false;
        
        // Recalculate author total likes explicitly if author mode is active to show live
        if (currentAuthorFilter) {
            updateAuthorTotalStats();
        }
    }
}

async function updateAuthorTotalStats() {
    if (!currentAuthorFilter) return;
    try {
        const { data } = await supabase.from('mini_apps').select('views_count, likes_count').eq('creator_id', currentAuthorFilter).eq('visibility', 'public');
        if (data) {
            let tv = 0; let tl = 0;
            data.forEach(d => {
                tv += d.views_count || 0;
                tl += d.likes_count || 0;
            });
            const vEl = document.getElementById('miniapps-author-views');
            const lEl = document.getElementById('miniapps-author-likes');
            if (vEl) vEl.textContent = String(tv);
            if (lEl) lEl.textContent = String(tl);
        }
    } catch(e) {}
}

let loadedMiniAppsData: any[] = [];

async function loadMiniApps(tab: string) {
    const listEl = document.getElementById('mini-apps-list')!;
    listEl.innerHTML = '<div class="text-center p-4 text-gray-500"><div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>Загрузка...</div>';

    try {
        let isDirectLinkSearch = false;
        let query = supabase.from('mini_apps').select(`
            *,
            creator:creator_id(username, display_name, avatar_url)
        `).order('created_at', { ascending: false });

        if (currentAuthorFilter) {
            query = query.eq('creator_id', currentAuthorFilter).eq('visibility', 'public');
        } else if (currentSearchQuery) {
            let extractedId = currentSearchQuery.trim();
            if (extractedId.includes('?miniapp=')) {
                try {
                    const url = new URL(extractedId);
                    extractedId = url.searchParams.get('miniapp') || extractedId;
                } catch(e) {}
            }
            
            if (extractedId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                query = supabase.from('mini_apps').select(`
                    *,
                    creator:creator_id(username, display_name, avatar_url)
                `).eq('id', extractedId);
                isDirectLinkSearch = true;
            } else {
                const { data: creators } = await supabase.from('profiles').select('id').or(`username.ilike.%${currentSearchQuery}%,display_name.ilike.%${currentSearchQuery}%`);
                const creatorIds = creators?.map(c => c.id) || [];
                if (creatorIds.length > 0) {
                    query = query.or(`title.ilike.%${currentSearchQuery}%,description.ilike.%${currentSearchQuery}%,creator_id.in.(${creatorIds.join(',')})`);
                } else {
                    query = query.or(`title.ilike.%${currentSearchQuery}%,description.ilike.%${currentSearchQuery}%`);
                }
            }
        }

        if (!isDirectLinkSearch && !currentAuthorFilter) {
            if (tab === 'public') {
                query = query.eq('visibility', 'public');
            } else if (tab === 'favorites') {
                if (!state.currentUser) {
                    listEl.innerHTML = '<div class="text-center p-4 text-gray-500">Войдите, чтобы просматривать избранное</div>';
                    return;
                }
                const { data: favs } = await supabase.from('mini_apps_likes').select('app_id').eq('user_id', state.currentUser.id).limit(50);
                const favIds = favs?.map(f => f.app_id) || [];
                if (favIds.length === 0) {
                    listEl.innerHTML = `<div class="text-center p-8 text-gray-500 dark:text-gray-400 flex flex-col items-center">
                        <svg class="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                        <p>Нет проектов в избранном</p>
                        </div>`;
                    return;
                }
                query = query.in('id', favIds);
            } else {
                query = query.eq('creator_id', state.currentUser!.id);
            }
        }

        const { data, error } = await query.limit(50);

        if (error) {
            // Check if table exists error
            if (error.code === '42P01') {
                listEl.innerHTML = `<div class="text-center p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800">
                    <svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    <p class="font-bold">Таблица mini_apps не найдена</p>
                    <p class="text-sm mt-2">Пожалуйста, выполните скрипт <b>MINI_APPS_SETUP.sql</b> в Supabase SQL Editor.</p>
                </div>`;
                return;
            }
            throw error;
        }

        if (!data || data.length === 0) {
            listEl.innerHTML = `<div class="text-center p-8 text-gray-500 dark:text-gray-400 flex flex-col items-center">
                <svg class="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                <p>${currentAuthorFilter ? 'У автора нет публичных приложений.' : (currentSearchQuery ? 'По вашему запросу ничего не найдено' : (tab === 'public' ? 'Нет публичных приложений' : 'У вас пока нет своих приложений'))}</p>
                </div>`;
            return;
        }
        
        if (currentAuthorFilter) {
            let tv = 0; let tl = 0;
            data.forEach(d => {
                tv += d.views_count || 0;
                tl += d.likes_count || 0;
            });
            document.getElementById('miniapps-author-views')!.textContent = String(tv);
            document.getElementById('miniapps-author-likes')!.textContent = String(tl);
        }
        
        let likedAppIds: Set<string> = new Set();
        if (state.currentUser && data.length > 0) {
            const appIds = data.map(a => a.id);
            try {
                const { data: likesData } = await supabase.from('mini_apps_likes').select('app_id').in('app_id', appIds).eq('user_id', state.currentUser.id);
                if (likesData) {
                    likedAppIds = new Set(likesData.map(l => l.app_id));
                }
            } catch(e) {} // ignore if likes table doesn't exist yet
        }

        loadedMiniAppsData = data;
        listEl.innerHTML = data.map(app => {
            const isLiked = likedAppIds.has(app.id);
            return `
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow relative group">
                <div class="flex items-start gap-4">
                    <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-inner shrink-0 truncate px-1 cursor-pointer" onclick="window.runMiniApp('${app.id}')">
                        ${app.icon_url ? `<img src="${app.icon_url}" class="w-full h-full object-cover rounded-2xl">` : app.title.substring(0, 2).toUpperCase()}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start gap-2">
                            <div class="flex items-center gap-1 min-w-0">
                                <h4 class="font-bold text-gray-900 dark:text-white truncate text-lg leading-tight cursor-pointer hover:text-blue-500 transition-colors" onclick="window.runMiniApp('${app.id}')">${app.title.replace(/</g, '&lt;')}</h4>
                            </div>
                            <span class="text-xs font-semibold ${app.visibility === 'public' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'} px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">${app.visibility === 'public' ? 'Публичное' : 'По ссылке'}</span>
                        </div>
                        <div class="flex items-start gap-1 mt-1">
                            <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 min-w-0 flex-1">${app.description ? app.description.replace(/</g, '&lt;') : 'Нет описания'}</p>
                            <button onclick="window.showMiniAppDetails('${app.id}')" class="text-gray-400 flex-shrink-0 hover:text-blue-500 text-sm font-bold w-6 text-right leading-relaxed" title="Подробнее">...</button>
                        </div>
                        <div class="flex items-center gap-4 mt-3 text-xs text-gray-400 dark:text-gray-500">
                            <div class="flex items-center gap-1 min-w-0" title="Автор">
                                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                <span class="truncate hover:text-blue-500 cursor-pointer transition-colors" onclick="window.showAuthorMiniApps('${app.creator_id}', '${(app.creator?.display_name || app.creator?.username || '').replace(/'/g, "\\'")}')">${app.creator?.display_name || app.creator?.username || 'Unknown'}</span>
                            </div>
                            <div class="flex items-center gap-1 flex-shrink-0" title="Запусков">
                                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span id="view-count-${app.id}">${app.views_count || 0}</span>
                            </div>
                            <div class="flex items-center gap-1 flex-shrink-0">
                                <button id="like-btn-${app.id}" data-liked="${isLiked}" onclick="window.toggleLikeMiniApp('${app.id}')" class="transition-colors ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}" title="Нравится">
                                    ${isLiked 
                                        ? `<svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>` 
                                        : `<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>`}
                                </button>
                                <span id="like-count-${app.id}">${app.likes_count || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mt-4 flex gap-2">
                    <button onclick="window.runMiniApp('${app.id}')" class="flex-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm">Запустить</button>
                    ${app.visibility === 'unlisted' && app.creator_id === state.currentUser?.id ? `
                        <button onclick="window.copyMiniAppLink('${app.id}')" class="px-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 py-2 rounded-xl text-sm transition-colors shadow-sm" title="Скопировать ссылку на проект">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                        </button>
                    ` : ''}
                    ${tab === 'my' ? `
                        <button onclick="window.openEditMiniApp('${app.id}', '${app.title.replace(/'/g, "\\'")}', '${(app.description || '').replace(/'/g, "\\'")}', ${app.visibility === 'public'})" class="px-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 py-2 rounded-xl text-sm transition-colors shadow-sm" title="Редактировать">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button onclick="window.deleteMiniApp('${app.id}')" class="px-3 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 py-2 rounded-xl text-sm transition-colors shadow-sm" title="Удалить">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    ` : ''}
                </div>
            </div>
            `;}).join('');

    } catch (e: any) {
        console.error('Error loading mini apps', e);
        listEl.innerHTML = `<div class="text-red-500 p-4 text-center">Ошибка: ${e.message}</div>`;
    }
}

export function showMiniAppDetails(id: string) {
    const app = loadedMiniAppsData.find(a => a.id === id);
    if (!app) return;
    document.getElementById('miniapp-details-title')!.textContent = app.title;
    document.getElementById('miniapp-details-desc')!.textContent = app.description || 'Нет описания';
    document.getElementById('miniapp-details-modal')!.classList.remove('hidden');
}

(window as any).showMiniAppDetails = showMiniAppDetails;

export function openCreateMiniApp() {
    (document.getElementById('miniapp-title') as HTMLInputElement).value = '';
    (document.getElementById('miniapp-desc') as HTMLTextAreaElement).value = '';
    (document.getElementById('miniapp-file') as HTMLInputElement).value = '';
    (document.getElementById('miniapp-public-toggle') as HTMLInputElement).checked = false;
    document.getElementById('mini-app-create-modal')!.classList.remove('hidden');
}

export function closeCreateMiniApp() {
    document.getElementById('mini-app-create-modal')!.classList.add('hidden');
}

export async function submitMiniApp() {
    const titleBtn = document.getElementById('miniapp-title') as HTMLInputElement;
    const descBtn = document.getElementById('miniapp-desc') as HTMLTextAreaElement;
    const fileInput = document.getElementById('miniapp-file') as HTMLInputElement;
    const isPublic = (document.getElementById('miniapp-public-toggle') as HTMLInputElement).checked;
    const iconInput = document.getElementById('miniapp-icon') as HTMLInputElement;
    
    if (!titleBtn.value.trim()) return customToast('Укажите название проекта');
    if (titleBtn.value.trim().length > 25) return customToast('Название не должно превышать 25 символов');
    if (descBtn.value.trim().length > 200) return customToast('Описание не должно превышать 200 символов');
    if (!fileInput.files || fileInput.files.length === 0) return customToast('Выберите HTML файл');

    const file = fileInput.files[0];
    if (file.size > 2 * 1024 * 1024) return customToast('Файл слишком большой (> 2 МБ)');

    let iconFile: File | null = null;
    if (iconInput.files && iconInput.files.length > 0) {
        iconFile = iconInput.files[0];
        if (iconFile.size > 2 * 1024 * 1024) return customToast('Иконка слишком большая (> 2 МБ)');
    }

    const btn = document.getElementById('miniapp-submit-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Загрузка...';

    try {
        const text = await file.text();
        
        // Basic check
        if (!text.includes('<html') && !text.includes('<body')) {
            throw new Error("Файл не похож на HTML.");
        }

        // Add script injection before upload
        const scriptInjection = `
            <script>
                window.VibeAPI = {
                    ready: function() {
                        window.parent.postMessage({ type: 'vibe_ready' }, '*');
                    },
                    getUser: function() {
                        return new Promise((resolve) => {
                            const id = Math.random().toString(36).substring(7);
                            const handler = (e) => {
                                if(e.data && e.data.type === 'vibe_user_data' && e.data.reqId === id) {
                                    window.removeEventListener('message', handler);
                                    resolve(e.data.user);
                                }
                            };
                            window.addEventListener('message', handler);
                            window.parent.postMessage({ type: 'vibe_get_user', reqId: id }, '*');
                        });
                    },
                    showAlert: function(msg) {
                        window.parent.postMessage({ type: 'vibe_show_alert', message: msg }, '*');
                    },
                    close: function() {
                        window.parent.postMessage({ type: 'vibe_close' }, '*');
                    }
                };
            </script>
        `;

        let htmlToLoad = text;
        if (htmlToLoad.includes('<head>')) {
             htmlToLoad = htmlToLoad.replace('<head>', '<head>' + scriptInjection);
        } else if (htmlToLoad.includes('<body>')) {
             htmlToLoad = htmlToLoad.replace('<body>', '<body>' + scriptInjection);
        } else {
             htmlToLoad = scriptInjection + htmlToLoad;
        }

        // Upload to Cloudinary
        const modifiedBlob = new Blob([htmlToLoad], { type: 'text/html' });
        const modifiedFile = new File([modifiedBlob], 'index.html', { type: 'text/html' });
        const htmlUrl = await uploadToCloudinary(modifiedFile);
        
        let iconUrl = null;
        if (iconFile) {
            iconUrl = await uploadToCloudinary(iconFile);
        }

        const { error } = await supabase.from('mini_apps').insert({
            creator_id: state.currentUser!.id,
            title: titleBtn.value.trim(),
            description: descBtn.value.trim(),
            html_url: htmlUrl,
            icon_url: iconUrl,
            visibility: isPublic ? 'public' : 'unlisted',
        });

        if (error) {
            if (error.code === '42P01') {
                throw new Error("Таблица mini_apps не найдена (выполните SQL)");
            }
            throw error;
        }

        customToast('Мини-приложение опубликовано!');
        closeCreateMiniApp();
        if (isPublic) switchMiniAppTab('public');
        else switchMiniAppTab('my');

    } catch (e: any) {
        console.error(e);
        customToast(`Ошибка: ${e.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Загрузить и Опубликовать';
    }
}

let miniAppContentData: any = null;

export function openEditMiniApp(id: string, title: string, desc: string, isPublic: boolean) {
    currentlyEditingAppId = id;
    const modal = document.getElementById('mini-app-edit-modal');
    if (modal) {
        modal.classList.remove('hidden');
        (document.getElementById('edit-miniapp-title') as HTMLInputElement).value = title || '';
        (document.getElementById('edit-miniapp-desc') as HTMLTextAreaElement).value = desc || '';
        (document.getElementById('edit-miniapp-public-toggle') as HTMLInputElement).checked = isPublic;
        (document.getElementById('edit-miniapp-file') as HTMLInputElement).value = '';
    }
}

export function closeEditMiniApp() {
    currentlyEditingAppId = null;
    const modal = document.getElementById('mini-app-edit-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export async function submitEditMiniApp() {
    if (!currentlyEditingAppId) return;

    const titleBtn = document.getElementById('edit-miniapp-title') as HTMLInputElement;
    const descBtn = document.getElementById('edit-miniapp-desc') as HTMLTextAreaElement;
    const fileInput = document.getElementById('edit-miniapp-file') as HTMLInputElement;
    const iconInput = document.getElementById('edit-miniapp-icon') as HTMLInputElement;
    const isPublic = (document.getElementById('edit-miniapp-public-toggle') as HTMLInputElement).checked;

    if (!titleBtn.value.trim()) {
        customToast('Введите название проекта!');
        return;
    }
    if (titleBtn.value.trim().length > 25) {
        customToast('Название не должно превышать 25 символов');
        return;
    }
    if (descBtn.value.trim().length > 200) {
        customToast('Описание не должно превышать 200 символов');
        return;
    }

    let iconFile: File | null = null;
    if (iconInput.files && iconInput.files.length > 0) {
        iconFile = iconInput.files[0];
        if (iconFile.size > 2 * 1024 * 1024) {
            customToast('Иконка слишком большая (> 2 МБ)');
            return;
        }
    }

    const btn = document.getElementById('edit-miniapp-submit-btn') as HTMLButtonElement;
    const ogText = btn.innerHTML;
    btn.innerHTML = 'Сохранение...';
    btn.disabled = true;

    try {
        let htmlUrl = undefined;
        let htmlContent = undefined;

        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            let htmlToLoad = await file.text();
            
            // basic injection
            if (!htmlToLoad.includes('vibegram_sdk')) {
                 const scriptInjection = `<script>
                    window.vibegram_sdk = true;
                    // Mock simple functions for test inside window
                    window.getUserProfile = () => {
                        return new Promise((resolve) => {
                            window.parent.postMessage({ type: 'vibe_get_user' }, '*');
                            window.addEventListener('message', function handler(e) {
                                if (e.data && e.data.type === 'vibe_user_data') {
                                    window.removeEventListener('message', handler);
                                    resolve(e.data.user);
                                }
                            });
                        });
                    };
                 </script>\n`;
                 htmlToLoad = scriptInjection + htmlToLoad;
            }

            // Upload new file to Cloudinary
            const modifiedBlob = new Blob([htmlToLoad], { type: 'text/html' });
            const modifiedFile = new File([modifiedBlob], 'index.html', { type: 'text/html' });
            htmlUrl = await uploadToCloudinary(modifiedFile);
        }

        const updateData: any = {
            title: titleBtn.value.trim(),
            description: descBtn.value.trim(),
            visibility: isPublic ? 'public' : 'unlisted',
        };

        if (htmlUrl !== undefined) {
             updateData.html_url = htmlUrl;
        }
        if (iconFile) {
            const uploadedIconUrl = await uploadToCloudinary(iconFile);
            updateData.icon_url = uploadedIconUrl;
        }

        const { error } = await supabase.from('mini_apps').update(updateData).eq('id', currentlyEditingAppId);

        if (error) {
            throw error;
        }

        customToast('Изменения сохранены!');
        closeEditMiniApp();
        loadMiniApps(activeTab);

    } catch (e: any) {
        console.error('Submit edit error', e);
        customToast('Ошибка сохранения: ' + e.message);
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
}

export async function runMiniApp(id: string) {
    customToast('Загрузка приложения...');
    
    try {
        const { data, error } = await supabase.from('mini_apps').select('*').eq('id', id).single();
        if (error) throw error;
        if (!data) throw new Error('Приложение не найдено');

        currentRunningAppId = id;
        miniAppContentData = data;

        document.getElementById('run-app-title')!.textContent = data.title;
        const iconEl = document.getElementById('run-app-icon')!;
        if (data.icon_url) {
            iconEl.innerHTML = `<img src="${data.icon_url}" class="w-full h-full object-cover rounded-lg">`;
        } else {
            iconEl.textContent = data.title.substring(0, 2).toUpperCase();
        }

        const runModal = document.getElementById('mini-app-run-modal')!;
        const iframe = document.getElementById('mini-app-frame') as HTMLIFrameElement;
        
        if (data.html_content && data.html_content.trim().startsWith('<')) {
            iframe.srcdoc = data.html_content;
        } else if (data.html_content && data.html_content.startsWith('https://')) {
            try {
                const res = await fetch(data.html_content);
                if (!res.ok) throw new Error('Fetch failed');
                const text = await res.text();
                iframe.srcdoc = text;
            } catch (err) {
                iframe.src = data.html_content; 
            }
        } else if (data.html_url) {
            try {
                const res = await fetch(data.html_url);
                if (!res.ok) throw new Error('Fetch failed');
                const text = await res.text();
                iframe.srcdoc = text;
            } catch (err) {
                iframe.src = data.html_url; 
            }
        } else if (data.html_content) {
            iframe.srcdoc = data.html_content;
        }

        runModal.classList.remove('hidden');
        setTimeout(() => runModal.classList.remove('translate-y-full'), 10);

        // Increment views
        supabase.rpc('increment_miniapp_view', { app_id: id }).then(res => {
            if (res.error) {
                // Alternatively if RPC doesn't exist, just manual update
                supabase.from('mini_apps').update({ views_count: (data.views_count || 0) + 1 }).eq('id', id).then();
            }
        });

    } catch(e: any) {
        customToast(`Ошибка: ${e.message}`);
    }
}

export function closeMiniApp() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('miniapp')) {
        window.location.href = window.location.pathname;
        return;
    }

    const runModal = document.getElementById('mini-app-run-modal');
    if (runModal) {
        runModal.classList.add('translate-y-full');
        setTimeout(() => {
            runModal.classList.add('hidden');
            const iframe = document.getElementById('mini-app-frame') as HTMLIFrameElement;
            iframe.srcdoc = '';
            currentRunningAppId = null;
            miniAppContentData = null;
        }, 300);
    }
}

export function copyMiniAppLink(appId?: string) {
    const id = appId || currentRunningAppId;
    if (!id) return;
    const url = `${window.location.origin}${window.location.pathname}?miniapp=${id}`;
    navigator.clipboard.writeText(url).then(() => {
        customToast('Ссылка на проект скопирована!');
    });
}

export async function runStandaloneMiniApp(id: string) {
    try {
        currentRunningAppId = id;
        const { data, error } = await supabase.from('mini_apps').select('*').eq('id', id).single();
        if (error || !data) throw error || new Error('App Not Found');

        const screens = ['auth-screen', 'lock-screen', 'app-screen', 'initial-loader'];
        screens.forEach(sId => document.getElementById(sId)?.classList.add('hidden'));

        const standaloneScreen = document.getElementById('standalone-miniapp-screen')!;
        standaloneScreen.classList.remove('hidden');
        standaloneScreen.classList.add('flex');

        const iframe = document.getElementById('standalone-miniapp-frame') as HTMLIFrameElement;
        
        if (data.html_content && data.html_content.trim().startsWith('<')) {
            iframe.srcdoc = data.html_content;
        } else if (data.html_content && data.html_content.startsWith('https://')) {
            try {
                const res = await fetch(data.html_content);
                if (!res.ok) throw new Error('Fetch failed');
                const text = await res.text();
                iframe.srcdoc = text;
            } catch (err) {
                iframe.src = data.html_content; 
            }
        } else if (data.html_url) {
            try {
                const res = await fetch(data.html_url);
                if (!res.ok) throw new Error('Fetch failed');
                const text = await res.text();
                iframe.srcdoc = text;
            } catch (err) {
                iframe.src = data.html_url; 
            }
        } else if (data.html_content) {
            iframe.srcdoc = data.html_content;
        }

        supabase.rpc('increment_miniapp_view', { app_id: id }).then(res => {
            if (res.error) supabase.from('mini_apps').update({ views_count: (data.views_count || 0) + 1 }).eq('id', id).then();
        });
        
        window.addEventListener('message', handleMiniAppMessage);
    } catch (e: any) {
        document.body.innerHTML = `<div class="h-full w-full flex items-center justify-center text-red-500 font-bold bg-white dark:bg-gray-900">Ошибка загрузки приложения: ${e.message}</div>`;
    }
}

function handleMiniAppMessage(event: MessageEvent) {
    if (!event.data || !currentRunningAppId) return;

    // Optional: check origin if we served it from a different origin, but srcdoc is 'null' or same-origin
    
    if (event.data.type === 'vibe_ready') {
        console.log("Mini app " + currentRunningAppId + " is ready.");
    }

    if (event.data.type === 'vibe_get_user') {
        const urlParams = new URLSearchParams(window.location.search);
        const isStandalone = urlParams.has('miniapp');
        const iframeId = isStandalone ? 'standalone-miniapp-frame' : 'mini-app-frame';
        const iframe = document.getElementById(iframeId) as HTMLIFrameElement;
        
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'vibe_user_data',
                reqId: event.data.reqId,
                user: state.currentUser ? {
                    id: state.currentUser.id,
                    nickname: state.currentProfile?.display_name || state.currentProfile?.username,
                    avatar_url: state.currentProfile?.avatar_url
                } : null
            }, '*');
        }
    }

    if (event.data.type === 'vibe_show_alert') {
        customToast(String(event.data.message));
    }

    if (event.data.type === 'vibe_close') {
        closeMiniApp();
    }
}

export async function deleteMiniApp(id: string) {
    if(!confirm('Действительно удалить приложение?')) return;

    try {
        // Fetch to get html_content
        const { data: appData } = await supabase.from('mini_apps').select('*').eq('id', id).single();
        const { error } = await supabase.from('mini_apps').delete().eq('id', id);
        if (error) throw error;
        
        if (appData && appData.html_content && appData.html_content.startsWith('https://')) {
            import('./utils').then(m => m.softDeleteCloudinaryFile(appData.html_content));
        } else if (appData && appData.html_url) {
            import('./utils').then(m => m.softDeleteCloudinaryFile(appData.html_url));
        }

        customToast('Удалено');
        loadMiniApps(activeTab);
    } catch(e: any) {
        customToast(`Ошибка: ${e.message}`);
    }
}
