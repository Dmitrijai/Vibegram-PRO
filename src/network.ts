export interface GatewayNode {
    id: string;
    name: string;
    url: string;
    type: 'custom' | 'edge-proxy' | 'direct' | 'cf-worker';
    latencyMs: number | null;
    status: 'unknown' | 'online' | 'blocked' | 'testing';
    lastChecked: number;
}

const CUSTOM_GATEWAY_KEY = 'vibegram_custom_gateway';
const PREFERRED_GATEWAY_KEY = 'vibegram_preferred_gateway_id';
const LAST_WORKING_GATEWAY_KEY = 'vibegram_last_working_gateway_url';

export const DIRECT_SUPABASE_URL = 'https://dxoyyflsqrzgzjfihgcx.supabase.co';

export const networkState = {
    activeGatewayId: 'default',
    activeGatewayUrl: '',
    lastPingMs: null as number | null,
    realtimeConnected: false,
    transportMode: 'connecting' as 'websocket' | 'http-turbo' | 'connecting' | 'offline',
    isSyncing: false,
    gateways: [] as GatewayNode[],
    listeners: new Set<() => void>()
};

export function subscribeNetworkState(cb: () => void) {
    networkState.listeners.add(cb);
    return () => networkState.listeners.delete(cb);
}

export function notifyNetworkState() {
    updateTopNetworkBanner();
    networkState.listeners.forEach((cb) => {
        try {
            cb();
        } catch (e) {}
    });
}

function cleanGatewayUrl(raw: string): string {
    return raw.trim().replace(/\/rest\/v[0-9]+\/?$/i, '').replace(/\/+$/, '');
}

export function getCustomGatewayUrl(): string {
    try {
        return cleanGatewayUrl(localStorage.getItem(CUSTOM_GATEWAY_KEY) || '');
    } catch (e) {
        return '';
    }
}

export function setCustomGatewayUrl(url: string) {
    const cleaned = cleanGatewayUrl(url);
    try {
        if (cleaned) {
            localStorage.setItem(CUSTOM_GATEWAY_KEY, cleaned);
            localStorage.setItem(PREFERRED_GATEWAY_KEY, 'custom');
        } else {
            localStorage.removeItem(CUSTOM_GATEWAY_KEY);
            if (localStorage.getItem(PREFERRED_GATEWAY_KEY) === 'custom') {
                localStorage.removeItem(PREFERRED_GATEWAY_KEY);
            }
        }
    } catch (e) {}
    rebuildGatewayList(configuredEnvUrl);
    notifyNetworkState();
}

let configuredEnvUrl = '';
let supabaseAnonKeyRef = '';

export function initNetworkManager(envSupabaseUrl: string, anonKey: string) {
    configuredEnvUrl = cleanGatewayUrl(envSupabaseUrl) || DIRECT_SUPABASE_URL;
    supabaseAnonKeyRef = anonKey;
    rebuildGatewayList(configuredEnvUrl);

    // Run initial gateway race in background without blocking startup
    setTimeout(() => {
        raceGateways(false).catch(() => {});
    }, 150);
}

export function rebuildGatewayList(envUrl: string) {
    const list: GatewayNode[] = [];
    const customUrl = getCustomGatewayUrl();

    if (customUrl && customUrl.startsWith('http')) {
        list.push({
            id: 'custom',
            name: 'Личный прокси-шлюз',
            url: customUrl,
            type: 'custom',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0
        });
    }

    // Same-origin /api/supabase proxy (works on Cloud Run, Vercel, Netlify, Dev Server)
    const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
    const isFileOrCap =
        typeof window !== 'undefined' &&
        (window.location.protocol === 'file:' ||
            window.location.protocol === 'capacitor:' ||
            (window as any).Capacitor?.isNativePlatform?.());

    if (typeof window !== 'undefined' && !isGitHubPages && !isFileOrCap && window.location.origin.startsWith('http')) {
        list.push({
            id: 'local-edge',
            name: 'Встроенный туннель (/api/supabase)',
            url: `${window.location.origin}/api/supabase`,
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0
        });
    }

    // If envUrl is a custom non-dead URL (not vibegram.qd.je), place it high priority
    if (envUrl && envUrl.startsWith('http') && !envUrl.includes('vibegram.qd.je')) {
        const isDirect = envUrl.includes('supabase.co');
        list.push({
            id: 'env-primary',
            name: isDirect ? 'Прямой сервер AWS (supabase.co)' : `Основной шлюз (${new URL(envUrl).hostname})`,
            url: envUrl,
            type: isDirect ? 'direct' : 'cf-worker',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0
        });
    }

    // Add Direct Supabase AWS endpoint (verified online: ~98ms)
    if (!list.some((g) => g.url === DIRECT_SUPABASE_URL)) {
        list.push({
            id: 'direct-aws',
            name: 'Прямой сервер AWS (supabase.co)',
            url: DIRECT_SUPABASE_URL,
            type: 'direct',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0
        });
    }

    // Add live Cloudflare mirror vibegram.qzz.io (verified online: ~230ms)
    if (!list.some((g) => g.url === 'https://vibegram.qzz.io')) {
        list.push({
            id: 'mirror-qzz',
            name: 'Шлюз Cloudflare (vibegram.qzz.io)',
            url: 'https://vibegram.qzz.io',
            type: 'cf-worker',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0
        });
    }

    // Add vibegram.qd.je last (currently NXDOMAIN in global DNS, kept only as last-resort fallback)
    if (!list.some((g) => g.url === 'https://vibegram.qd.je')) {
        list.push({
            id: 'mirror-qd',
            name: 'Резервный домен (vibegram.qd.je)',
            url: 'https://vibegram.qd.je',
            type: 'cf-worker',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0
        });
    }

    // Preserve previous latency/status measurements if matching URL
    for (const item of list) {
        const prev = networkState.gateways.find((p) => p.url === item.url);
        if (prev) {
            item.latencyMs = prev.latencyMs;
            item.status = prev.status;
            item.lastChecked = prev.lastChecked;
        }
    }

    networkState.gateways = list;

    // Determine initial active gateway
    let preferredId = '';
    let lastWorkingUrl = '';
    try {
        preferredId = localStorage.getItem(PREFERRED_GATEWAY_KEY) || '';
        lastWorkingUrl = localStorage.getItem(LAST_WORKING_GATEWAY_KEY) || '';
    } catch (e) {}

    const byPref = list.find((g) => g.id === preferredId);
    const byLastWorking = list.find((g) => g.url === lastWorkingUrl);
    const chosen = byPref || byLastWorking || list[0];

    if (chosen) {
        networkState.activeGatewayId = chosen.id;
        networkState.activeGatewayUrl = chosen.url;
    }
}

export function selectGatewayById(id: string) {
    const found = networkState.gateways.find((g) => g.id === id);
    if (!found) return;
    networkState.activeGatewayId = found.id;
    networkState.activeGatewayUrl = found.url;
    try {
        localStorage.setItem(PREFERRED_GATEWAY_KEY, found.id);
        localStorage.setItem(LAST_WORKING_GATEWAY_KEY, found.url);
    } catch (e) {}
    notifyNetworkState();
}

async function probeSingleGateway(gw: GatewayNode, timeoutMs = 4500): Promise<{ ok: boolean; ms: number }> {
    gw.status = 'testing';
    notifyNetworkState();

    const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const probeUrl = `${gw.url}/rest/v1/`;
        const headers: Record<string, string> = {};
        if (supabaseAnonKeyRef) {
            headers['apikey'] = supabaseAnonKeyRef;
            headers['Authorization'] = `Bearer ${supabaseAnonKeyRef}`;
        }

        const res = await window.fetch(probeUrl, {
            method: 'GET',
            headers,
            signal: controller.signal
        });
        clearTimeout(timer);

        const elapsed = Math.max(1, Math.round(performance.now() - start));
        // Supabase /rest/v1/ returns 200 OK (OpenAPI spec) or 401/404 if reachable
        const isValidSupabaseResponse = res.status >= 200 && res.status < 500 && res.status !== 404;
        if (isValidSupabaseResponse) {
            gw.latencyMs = elapsed;
            gw.status = 'online';
            gw.lastChecked = Date.now();
            return { ok: true, ms: elapsed };
        } else {
            gw.latencyMs = null;
            gw.status = 'blocked';
            gw.lastChecked = Date.now();
            return { ok: false, ms: 99999 };
        }
    } catch (e) {
        clearTimeout(timer);
        gw.latencyMs = null;
        gw.status = 'blocked';
        gw.lastChecked = Date.now();
        return { ok: false, ms: 99999 };
    }
}

export async function raceGateways(forceSwitchToFastest = true): Promise<GatewayNode | null> {
    if (networkState.gateways.length === 0) return null;

    const results = await Promise.all(
        networkState.gateways.map(async (gw) => {
            const res = await probeSingleGateway(gw, 4500);
            return { gw, ...res };
        })
    );

    const working = results.filter((r) => r.ok).sort((a, b) => a.ms - b.ms);
    if (working.length > 0) {
        const currentGw = networkState.gateways.find((g) => g.id === networkState.activeGatewayId);
        const currentIsOnline = currentGw && currentGw.status === 'online';

        // Switch if forced, or if current gateway is blocked/slow
        if (forceSwitchToFastest || !currentIsOnline) {
            const best = working[0];
            networkState.activeGatewayId = best.gw.id;
            networkState.activeGatewayUrl = best.gw.url;
            networkState.lastPingMs = best.ms;
            try {
                localStorage.setItem(LAST_WORKING_GATEWAY_KEY, best.gw.url);
            } catch (e) {}
        } else if (currentGw && currentGw.latencyMs) {
            networkState.lastPingMs = currentGw.latencyMs;
        }

        if (networkState.transportMode === 'offline' || networkState.transportMode === 'connecting') {
            networkState.transportMode = networkState.realtimeConnected ? 'websocket' : 'http-turbo';
        }
        notifyNetworkState();
        return working[0].gw;
    } else {
        networkState.transportMode = 'offline';
        notifyNetworkState();
        return null;
    }
}

function extractSupabasePath(rawUrl: string): string | null {
    try {
        const parsed = new URL(rawUrl, window.location.origin);
        // Check if path contains standard Supabase endpoints
        const match = parsed.pathname.match(/\/(rest|auth|storage|functions|realtime)\/v1(\/.*)?$/);
        if (match) {
            return match[0] + parsed.search;
        }
    } catch (e) {}
    return null;
}

/**
 * Smart Fetch wrapper for @supabase/supabase-js
 * Automatically rewrites requests to the active gateway, enforces a fast 6.5s timeout
 * so TSPU 16KB TCP freezes don't lock the app for 30-60s, and transparently fails over
 * to alternative gateways on timeout or network error.
 */
export async function smartSupabaseFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const supabasePath = extractSupabasePath(rawUrl);

    if (!supabasePath || networkState.gateways.length === 0) {
        const timeoutSignal = AbortSignal.timeout(8000);
        const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
        return window.fetch(input, { ...init, signal });
    }

    // Order gateways: active gateway first, then online gateways by latency, then unknown, then others
    const activeGw = networkState.gateways.find((g) => g.id === networkState.activeGatewayId) || networkState.gateways[0];
    const otherGateways = networkState.gateways
        .filter((g) => g.id !== activeGw.id)
        .sort((a, b) => {
            if (a.status === 'online' && b.status !== 'online') return -1;
            if (b.status === 'online' && a.status !== 'online') return 1;
            return (a.latencyMs || 5000) - (b.latencyMs || 5000);
        });

    const candidates = [activeGw, ...otherGateways];
    let lastError: any = null;

    // Try up to 3 candidate gateways per request so failover is fast and automatic
    const maxAttempts = Math.min(candidates.length, 3);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const gw = candidates[attempt];
        const targetUrl = `${gw.url}${supabasePath}`;

        // 6.5s timeout for primary attempt, 5.5s for failover attempts
        const perAttemptTimeoutMs = attempt === 0 ? 6500 : 5500;
        const timeoutSignal = AbortSignal.timeout(perAttemptTimeoutMs);
        const combinedSignal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;

        const start = performance.now();
        try {
            const response = await window.fetch(targetUrl, {
                ...init,
                signal: combinedSignal
            });

            // If local-edge returns 404 (e.g. static server without /api/supabase) or Cloudflare returns 52x error
            if (
                (gw.id === 'local-edge' && response.status === 404) ||
                response.status === 502 ||
                response.status === 503 ||
                response.status === 504 ||
                (response.status >= 520 && response.status <= 526)
            ) {
                gw.status = 'blocked';
                lastError = new Error(`Gateway ${gw.name} returned HTTP ${response.status}`);
                continue;
            }

            const elapsed = Math.max(1, Math.round(performance.now() - start));
            gw.latencyMs = elapsed;
            gw.status = 'online';
            gw.lastChecked = Date.now();

            networkState.lastPingMs = elapsed;
            if (networkState.activeGatewayId !== gw.id) {
                networkState.activeGatewayId = gw.id;
                networkState.activeGatewayUrl = gw.url;
                try {
                    localStorage.setItem(LAST_WORKING_GATEWAY_KEY, gw.url);
                } catch (e) {}
            }
            if (networkState.transportMode === 'offline' || networkState.transportMode === 'connecting') {
                networkState.transportMode = networkState.realtimeConnected ? 'websocket' : 'http-turbo';
            }
            notifyNetworkState();
            return response;
        } catch (err: any) {
            lastError = err;
            // If user explicitly aborted the request (not our timeout), rethrow immediately
            if (init.signal?.aborted) {
                throw err;
            }
            gw.status = 'blocked';
            gw.latencyMs = null;
            gw.lastChecked = Date.now();
            notifyNetworkState();
        }
    }

    networkState.transportMode = 'offline';
    notifyNetworkState();
    throw lastError || new Error('Failed to fetch from all gateways');
}

export function setRealtimeConnectedState(connected: boolean) {
    networkState.realtimeConnected = connected;
    if (connected) {
        networkState.transportMode = 'websocket';
    } else if (networkState.transportMode !== 'offline') {
        networkState.transportMode = 'http-turbo';
    }
    notifyNetworkState();
}

export function setSyncingState(syncing: boolean) {
    if (networkState.isSyncing === syncing) return;
    networkState.isSyncing = syncing;
    notifyNetworkState();
}

export function updateTopNetworkBanner() {
    if (typeof document === 'undefined') return;
    const banner = document.getElementById('network-status-banner');
    if (!banner) return;

    const activeGw = networkState.gateways.find((g) => g.id === networkState.activeGatewayId);
    const pingText = networkState.lastPingMs ? `${networkState.lastPingMs} мс` : '';

    if (networkState.transportMode === 'offline') {
        banner.className =
            'px-3 py-1.5 bg-amber-500/15 dark:bg-amber-500/20 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 transition-all';
        banner.innerHTML = `
            <div class="flex items-center gap-2 min-w-0">
                <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0"></span>
                <span class="truncate font-medium">Обход блокировки ТСПУ: поиск шлюза...</span>
            </div>
            <button onclick="window.openSettings('full')" class="ml-2 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 font-semibold shrink-0 transition-colors">Шлюзы</button>
        `;
        banner.classList.remove('hidden');
    } else if (networkState.isSyncing) {
        banner.className =
            'px-3 py-1 bg-blue-500/10 dark:bg-blue-500/15 border-b border-blue-500/20 flex items-center justify-between text-[11px] text-blue-600 dark:text-blue-400 transition-all';
        banner.innerHTML = `
            <div class="flex items-center gap-2 min-w-0">
                <div class="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
                <span class="truncate font-medium">Синхронизация сети...</span>
            </div>
            <span class="font-mono text-[10px] opacity-80 shrink-0 tabular-nums">${pingText}</span>
        `;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}
