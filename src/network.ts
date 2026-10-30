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
export const PRIMARY_WORKER_URL = 'https://vibegram-edge-gw.vercel.app';
export const SECONDARY_EDGE_URL = 'https://vibegram-ru-node.vercel.app';
export const TERTIARY_EDGE_URL = 'https://vibegram-net-proxy.vercel.app';
export const LEGACY_CF_WORKER_URL = 'https://vibegram.qzz.io';

// Dead or suspended domains that must never be used even if present in old env vars or localStorage
const DEAD_DOMAINS = ['vibegram.qd.je', 'supa-proxy.onrender.com', 'onrender.com'];

export function isDeadGatewayUrl(url: string): boolean {
    if (!url || !url.startsWith('http')) return true;
    const lower = url.toLowerCase();
    return DEAD_DOMAINS.some((d) => lower.includes(d));
}

function isCloudflareOrDirectUrl(url: string): boolean {
    if (!url) return true;
    const lower = url.toLowerCase();
    return lower.includes('supabase.co') || lower.includes('vibegram.qzz.io');
}

export function rewriteLegacyStorageUrlsInJson(jsonText: string, activeGwUrl: string): string {
    if (!jsonText || !jsonText.includes('/storage/v1/')) return jsonText;
    const cleanGw = activeGwUrl.replace(/\/+$/, '');
    return jsonText.replace(
        /https:\/\/(?:dxoyyflsqrzgzjfihgcx\.supabase\.co|vibegram\.qzz\.io|supa-proxy\.onrender\.com|vibegram\.qd\.je)\/storage\/v1\//g,
        `${cleanGw}/storage/v1/`
    );
}

export const networkState = {
    activeGatewayId: 'edge-gw-1',
    activeGatewayUrl: PRIMARY_WORKER_URL,
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
        const val = cleanGatewayUrl(localStorage.getItem(CUSTOM_GATEWAY_KEY) || '');
        if (isDeadGatewayUrl(val)) {
            localStorage.removeItem(CUSTOM_GATEWAY_KEY);
            return '';
        }
        return val;
    } catch (e) {
        return '';
    }
}

export function setCustomGatewayUrl(url: string) {
    const cleaned = cleanGatewayUrl(url);
    try {
        if (cleaned && !isDeadGatewayUrl(cleaned)) {
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
    const cleanedEnv = cleanGatewayUrl(envSupabaseUrl);
    configuredEnvUrl = !isDeadGatewayUrl(cleanedEnv) && !isCloudflareOrDirectUrl(cleanedEnv) ? cleanedEnv : PRIMARY_WORKER_URL;
    supabaseAnonKeyRef = anonKey;

    // Purge any stale dead or Cloudflare URLs from localStorage so RU users without VPN immediately use AWS Edge
    try {
        const lastWorking = localStorage.getItem(LAST_WORKING_GATEWAY_KEY) || '';
        if (isDeadGatewayUrl(lastWorking) || isCloudflareOrDirectUrl(lastWorking)) {
            localStorage.removeItem(LAST_WORKING_GATEWAY_KEY);
        }
    } catch (e) {}

    rebuildGatewayList(configuredEnvUrl);
}

export function rebuildGatewayList(envUrl: string) {
    const list: GatewayNode[] = [];

    // 1. Same-origin /api/supabase proxy (when hosted on Node/Express/Cloud Run/Vercel/Netlify)
    const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
    const isFileOrCap =
        typeof window !== 'undefined' &&
        (window.location.protocol === 'file:' ||
            window.location.protocol === 'capacitor:' ||
            (window as any).Capacitor?.isNativePlatform?.());

    if (typeof window !== 'undefined' && !isGitHubPages && !isFileOrCap && window.location.origin.startsWith('http')) {
        list.push({
            id: 'local-edge',
            name: 'Встроенный серверный туннель',
            url: `${window.location.origin}/api/supabase`,
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0
        });
    }

    // 2. Primary AWS Anycast Edge Gateway #1 (non-Cloudflare, verified working in RU without VPN)
    list.push({
        id: 'edge-gw-1',
        name: 'Основной Edge-шлюз #1 (AWS)',
        url: PRIMARY_WORKER_URL,
        type: 'edge-proxy',
        latencyMs: null,
        status: 'unknown',
        lastChecked: 0
    });

    // 3. Secondary AWS Anycast Edge Gateway #2 (non-Cloudflare)
    list.push({
        id: 'edge-gw-2',
        name: 'Резервный Edge-шлюз #2 (AWS)',
        url: SECONDARY_EDGE_URL,
        type: 'edge-proxy',
        latencyMs: null,
        status: 'unknown',
        lastChecked: 0
    });

    // 4. Tertiary AWS Anycast Edge Gateway #3 (non-Cloudflare)
    list.push({
        id: 'edge-gw-3',
        name: 'Резервный Edge-шлюз #3 (AWS)',
        url: TERTIARY_EDGE_URL,
        type: 'edge-proxy',
        latencyMs: null,
        status: 'unknown',
        lastChecked: 0
    });

    // 5. Legacy Cloudflare Worker fallback
    if (!list.some((g) => g.url === LEGACY_CF_WORKER_URL)) {
        list.push({
            id: 'mirror-qzz',
            name: 'Резервный CF-узел (vibegram.qzz.io)',
            url: LEGACY_CF_WORKER_URL,
            type: 'cf-worker',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0
        });
    }

    // 6. Direct Supabase endpoint (last fallback)
    if (!list.some((g) => g.url === DIRECT_SUPABASE_URL)) {
        list.push({
            id: 'direct-aws',
            name: 'Прямой узел Supabase',
            url: DIRECT_SUPABASE_URL,
            type: 'direct',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0
        });
    }

    for (const item of list) {
        const prev = networkState.gateways.find((p) => p.url === item.url);
        if (prev) {
            item.latencyMs = prev.latencyMs;
            item.status = prev.status;
            item.lastChecked = prev.lastChecked;
        }
    }

    networkState.gateways = list;

    let lastWorkingUrl = '';
    try {
        lastWorkingUrl = localStorage.getItem(LAST_WORKING_GATEWAY_KEY) || '';
    } catch (e) {}

    const byLastWorking =
        !isDeadGatewayUrl(lastWorkingUrl) && !isCloudflareOrDirectUrl(lastWorkingUrl)
            ? list.find((g) => g.url === lastWorkingUrl)
            : undefined;
    const chosen = byLastWorking || list[0];

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
        localStorage.setItem(LAST_WORKING_GATEWAY_KEY, found.url);
    } catch (e) {}
    notifyNetworkState();
}

export async function raceGateways(forceSwitchToFastest = true): Promise<GatewayNode | null> {
    if (networkState.gateways.length === 0) return null;
    return networkState.gateways[0];
}

function extractSupabasePath(rawUrl: string): string | null {
    try {
        const parsed = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : 'https://vibegram.qzz.io');
        const match = parsed.pathname.match(/\/(rest|auth|storage|functions|realtime)\/v1(\/.*)?$/);
        if (match) {
            return match[0] + parsed.search;
        }
    } catch (e) {}
    return null;
}

function isGatewayErrorResponse(gw: GatewayNode, response: Response): boolean {
    if (
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        (response.status >= 520 && response.status <= 526)
    ) {
        return true;
    }
    // If a proxy gateway returns 404 text/html or text/plain (e.g., static host or dead Render subdomain), it's not a real Supabase response
    if (response.status === 404) {
        const ct = (response.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('json')) {
            return true;
        }
    }
    return false;
}

async function fetchSingleAttempt(
    gw: GatewayNode,
    supabasePath: string,
    init: RequestInit,
    timeoutMs: number,
    parentSignal?: AbortSignal
): Promise<{ gw: GatewayNode; response: Response; elapsed: number }> {
    const targetUrl = `${gw.url}${supabasePath}`;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signals: AbortSignal[] = [timeoutSignal];
    if (init.signal) signals.push(init.signal);
    if (parentSignal) signals.push(parentSignal);
    const combinedSignal = signals.length > 1 ? AbortSignal.any(signals) : timeoutSignal;

    const start = performance.now();
    const response = await window.fetch(targetUrl, {
        ...init,
        signal: combinedSignal
    });

    if (isGatewayErrorResponse(gw, response)) {
        gw.status = 'blocked';
        throw new Error(`Gateway ${gw.id} HTTP ${response.status}`);
    }

    const elapsed = Math.max(1, Math.round(performance.now() - start));
    return { gw, response, elapsed };
}

function createGraceRefreshResponse(): Response | null {
    try {
        const raw = localStorage.getItem('sb-vibegram-auth-token');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.access_token || !parsed.refresh_token || !parsed.user) return null;

        // Extend local expiry by 90 seconds so GoTrueClient keeps the user logged in while network recovers
        const graceSession = {
            ...parsed,
            expires_in: 90,
            expires_at: Math.floor(Date.now() / 1000) + 90
        };
        return new Response(JSON.stringify(graceSession), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return null;
    }
}

/**
 * Resilient Fetch Engine for Supabase:
 * 1. Uses fast 4.5s socket timeouts so TSPU-stalled TCP sockets never hang for 30-60s.
 * 2. For read/auth-refresh requests, launches a hedged parallel socket after 2.0s if the first socket is stalled by DPI.
 * 3. Automatically retries across fresh sockets and backup gateways before ever returning an error.
 * 4. Protects token refresh from logging the user out if mobile internet briefly drops.
 */
export async function smartSupabaseFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const supabasePath = extractSupabasePath(rawUrl);

    if (!supabasePath || networkState.gateways.length === 0) {
        const timeoutSignal = AbortSignal.timeout(8000);
        const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
        return window.fetch(input, { ...init, signal });
    }

    const method = (init.method || 'GET').toUpperCase();
    const isTokenRefresh = supabasePath.includes('/auth/v1/token') && supabasePath.includes('grant_type=refresh_token');
    const isHedgeable = method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || isTokenRefresh;

    const activeGw = networkState.gateways.find((g) => g.id === networkState.activeGatewayId) || networkState.gateways[0];
    const otherGateways = networkState.gateways.filter((g) => g.id !== activeGw.id);

    // Build retry sequence: try active gateway twice (fresh TCP socket on 2nd try defeats TSPU random stream freeze), then alternatives
    const sequence: GatewayNode[] = [activeGw, ...otherGateways, activeGw];
    let lastError: any = null;

    for (let i = 0; i < sequence.length; i++) {
        const gw = sequence[i];
        const nextGw = sequence[(i + 1) % sequence.length];
        const raceController = new AbortController();

        try {
            let winner: { gw: GatewayNode; response: Response; elapsed: number };

            if (isHedgeable && nextGw) {
                // Start primary socket immediately; if it stalls > 2.2s due to TSPU, launch a parallel hedged socket
                winner = await new Promise((resolve, reject) => {
                    let settled = false;
                    let pendingCount = 1;
                    let hedgeTimer: any = null;

                    const onSuccess = (res: { gw: GatewayNode; response: Response; elapsed: number }) => {
                        if (settled) return;
                        settled = true;
                        if (hedgeTimer) clearTimeout(hedgeTimer);
                        raceController.abort();
                        resolve(res);
                    };

                    const onError = (err: any) => {
                        pendingCount--;
                        if (!settled && pendingCount <= 0) {
                            if (hedgeTimer) clearTimeout(hedgeTimer);
                            reject(err);
                        }
                    };

                    fetchSingleAttempt(gw, supabasePath, init, 5000, raceController.signal)
                        .then(onSuccess)
                        .catch(onError);

                    hedgeTimer = setTimeout(() => {
                        if (settled || init.signal?.aborted) return;
                        pendingCount++;
                        fetchSingleAttempt(nextGw, supabasePath, init, 5000, raceController.signal)
                            .then(onSuccess)
                            .catch(onError);
                    }, 2200);
                });
            } else {
                winner = await fetchSingleAttempt(gw, supabasePath, init, 6000);
            }

            winner.gw.latencyMs = winner.elapsed;
            winner.gw.status = 'online';
            winner.gw.lastChecked = Date.now();
            networkState.lastPingMs = winner.elapsed;

            if (networkState.activeGatewayId !== winner.gw.id) {
                networkState.activeGatewayId = winner.gw.id;
                networkState.activeGatewayUrl = winner.gw.url;
                try {
                    localStorage.setItem(LAST_WORKING_GATEWAY_KEY, winner.gw.url);
                } catch (e) {}
            }

            if (networkState.transportMode === 'offline' || networkState.transportMode === 'connecting') {
                networkState.transportMode = networkState.realtimeConnected ? 'websocket' : 'http-turbo';
            }
            notifyNetworkState();

            if (
                method === 'GET' &&
                supabasePath.startsWith('/rest/v1/') &&
                (winner.response.headers.get('content-type') || '').includes('application/json')
            ) {
                try {
                    const rawText = await winner.response.text();
                    const rewrittenText = rewriteLegacyStorageUrlsInJson(rawText, winner.gw.url);
                    return new Response(rewrittenText, {
                        status: winner.response.status,
                        statusText: winner.response.statusText,
                        headers: winner.response.headers
                    });
                } catch (e) {
                    return winner.response;
                }
            }

            return winner.response;
        } catch (err: any) {
            lastError = err;
            if (init.signal?.aborted) {
                throw err;
            }
            gw.status = 'blocked';
            gw.lastChecked = Date.now();
        }
    }

    // If token refresh timed out across all attempts, return grace session so GoTrueClient doesn't log the user out
    if (isTokenRefresh) {
        const graceRes = createGraceRefreshResponse();
        if (graceRes) {
            return graceRes;
        }
    }

    networkState.transportMode = 'offline';
    notifyNetworkState();
    throw lastError || new Error('Failed to fetch from gateways');
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
    // Intentionally empty: zero-config invisible bypass without UI banners
}
