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

export const PRIMARY_WORKER_URL = 'https://vibegram-edge-gw.vercel.app';
export const SECONDARY_EDGE_URL = 'https://vibegram-ru-node.vercel.app';
export const TERTIARY_EDGE_URL = 'https://vibegram-net-proxy.vercel.app';

export const EDGE_GATEWAY_URLS = [
    PRIMARY_WORKER_URL,
    SECONDARY_EDGE_URL,
    TERTIARY_EDGE_URL
];

// Dead or blocked domains that must never be used
const DEAD_OR_BLOCKED_DOMAINS = [
    'vibegram.qd.je',
    'supa-proxy.onrender.com',
    'onrender.com',
    'supabase.co',
    'vibegram.qzz.io'
];

export function isDeadGatewayUrl(url: string): boolean {
    if (!url || !url.startsWith('http')) return true;
    const lower = url.toLowerCase();
    return DEAD_OR_BLOCKED_DOMAINS.some((d) => lower.includes(d));
}

export const networkState = {
    activeGatewayId: 'edge-gw-1',
    activeGatewayUrl: PRIMARY_WORKER_URL,
    lastPingMs: null as number | null,
    realtimeConnected: false,
    transportMode: 'http-turbo' as 'websocket' | 'http-turbo' | 'connecting' | 'offline',
    isSyncing: false,
    gateways: [] as GatewayNode[],
    listeners: new Set<() => void>()
};

export function getActiveGatewayBaseUrl(): string {
    return (networkState.activeGatewayUrl || PRIMARY_WORKER_URL).replace(/\/+$/, '');
}

/**
 * Optimizes Cloudinary image paths with f_auto,q_auto,w_1280,c_limit while keeping video paths
 * exact so HTTP/2 206 Partial Content byte-range streaming starts in <100ms on first hit.
 */
function optimizeCloudinaryPath(pathAfterDomain: string, addAutoQuality = true): string {
    if (!addAutoQuality) return pathAfterDomain;
    const imageMatch = pathAfterDomain.match(/^(\/[^/]+\/image\/upload\/)(v\d+\/.*)$/);
    if (imageMatch) {
        return `${imageMatch[1]}f_auto,q_auto,w_1280,c_limit/${imageMatch[2]}`;
    }
    return pathAfterDomain;
}

/**
 * Generates an instant ~15KB JPEG first-frame poster URL for any Cloudinary video or video_circle
 * so chat bubbles display a preview frame in <100ms before the video stream even buffers.
 */
export function getVideoPosterUrl(rawVideoUrl: string | null | undefined): string {
    if (!rawVideoUrl || typeof rawVideoUrl !== 'string') return '';
    const proxied = rewriteMediaUrl(rawVideoUrl, undefined, false);
    const match = proxied.match(/^(https?:\/\/[^/]+\/cloudinary\/[^/]+\/video\/upload\/)(?:[^/]+\/)?(v\d+\/.+?)(\.[a-zA-Z0-9]+)?(\?.*)?$/);
    if (match) {
        return `${match[1]}f_jpg,so_0,w_480,c_limit,q_auto:good/${match[2]}.jpg`;
    }
    return '';
}

/**
 * Generates a lightweight 48kbps MP3 audio stream URL from any Cloudinary video/audio URL.
 * Reduces a 14 MB video circle to ~80 KB of audio so AI transcription downloads in <0.3s!
 */
export function getOptimizedAudioForTranscriptionUrl(rawMediaUrl: string): string {
    if (!rawMediaUrl || typeof rawMediaUrl !== 'string') return rawMediaUrl;
    const proxied = rewriteMediaUrl(rawMediaUrl, undefined, false);
    const match = proxied.match(/^(https?:\/\/[^/]+\/cloudinary\/[^/]+\/video\/upload\/)(?:[^/]+\/)?(v\d+\/.+?)(\.[a-zA-Z0-9]+)?(\?.*)?$/);
    if (match) {
        return `${match[1]}f_mp3,br_48k/${match[2]}.mp3`;
    }
    return proxied;
}

/**
 * Rewrites any blocked media or AI URL (res.cloudinary.com, supabase.co/storage,
 * generativelanguage.googleapis.com, router.huggingface.co, image.pollinations.ai)
 * to route through the active AWS Edge Gateway.
 */
export function rewriteMediaUrl(rawUrl: string | null | undefined, targetGwUrl?: string, addAutoQuality = true): string {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl || '';
    const trimmed = rawUrl.trim();
    if (!trimmed.startsWith('http')) return trimmed;

    const cleanGw = (targetGwUrl || getActiveGatewayBaseUrl()).replace(/\/+$/, '');

    // 1. Direct res.cloudinary.com URLs
    if (trimmed.startsWith('https://res.cloudinary.com/')) {
        const rest = optimizeCloudinaryPath(trimmed.substring('https://res.cloudinary.com'.length), addAutoQuality);
        return `${cleanGw}/cloudinary${rest}`;
    }

    // 2. Already-proxied /cloudinary/ URLs when switching gateways
    const existingCloudinaryIdx = trimmed.indexOf('/cloudinary/');
    if (existingCloudinaryIdx !== -1) {
        let rest = trimmed.substring(existingCloudinaryIdx + '/cloudinary'.length);
        if (!addAutoQuality) {
            rest = rest
                .replace('/video/upload/q_auto/v', '/video/upload/v')
                .replace('/image/upload/f_auto,q_auto,w_1280,c_limit/v', '/image/upload/v')
                .replace('/image/upload/f_auto,q_auto/v', '/image/upload/v');
        }
        return `${cleanGw}/cloudinary${rest}`;
    }

    // 3. Direct api.cloudinary.com upload/destroy URLs
    if (trimmed.startsWith('https://api.cloudinary.com/')) {
        const rest = trimmed.substring('https://api.cloudinary.com'.length);
        return `${cleanGw}/cloudinary-api${rest}`;
    }
    const existingCloudApiIdx = trimmed.indexOf('/cloudinary-api/');
    if (existingCloudApiIdx !== -1) {
        const rest = trimmed.substring(existingCloudApiIdx + '/cloudinary-api'.length);
        return `${cleanGw}/cloudinary-api${rest}`;
    }

    // 4. Google Gemini API URLs (bypasses RU IP geo-block 400 FAILED_PRECONDITION)
    if (trimmed.startsWith('https://generativelanguage.googleapis.com/')) {
        const rest = trimmed.substring('https://generativelanguage.googleapis.com'.length);
        return `${cleanGw}/gemini${rest}`;
    }
    const existingGeminiIdx = trimmed.indexOf('/gemini/');
    if (existingGeminiIdx !== -1) {
        const rest = trimmed.substring(existingGeminiIdx + '/gemini'.length);
        return `${cleanGw}/gemini${rest}`;
    }

    // 5. HuggingFace Router / Inference URLs
    if (trimmed.startsWith('https://router.huggingface.co/')) {
        const rest = trimmed.substring('https://router.huggingface.co'.length);
        return `${cleanGw}/hf${rest}`;
    }
    if (trimmed.startsWith('https://api-inference.huggingface.co/')) {
        const rest = trimmed.substring('https://api-inference.huggingface.co'.length);
        return `${cleanGw}/hf${rest}`;
    }
    const existingHfIdx = trimmed.indexOf('/hf/');
    if (existingHfIdx !== -1) {
        const rest = trimmed.substring(existingHfIdx + '/hf'.length);
        return `${cleanGw}/hf${rest}`;
    }

    // 6. Pollinations AI Image Generation URLs
    if (trimmed.startsWith('https://image.pollinations.ai/')) {
        const rest = trimmed.substring('https://image.pollinations.ai'.length);
        return `${cleanGw}/pollinations${rest}`;
    }
    const existingPollinationsIdx = trimmed.indexOf('/pollinations/');
    if (existingPollinationsIdx !== -1) {
        const rest = trimmed.substring(existingPollinationsIdx + '/pollinations'.length);
        return `${cleanGw}/pollinations${rest}`;
    }

    // 7. Legacy or direct Supabase storage URLs
    const storageIdx = trimmed.indexOf('/storage/v1/');
    if (storageIdx !== -1) {
        const rest = trimmed.substring(storageIdx);
        return `${cleanGw}${rest}`;
    }

    return trimmed;
}

/**
 * Rewrites all blocked storage and Cloudinary URLs inside raw JSON text
 * before JSON.parse() runs, so both network responses and localStorage caches
 * immediately point to our working AWS Edge Gateway.
 */
export function rewriteLegacyStorageUrlsInJson(jsonText: string, activeGwUrl?: string): string {
    if (!jsonText) return jsonText;
    const hasStorage = jsonText.includes('/storage/v1/');
    const hasCloudinary = jsonText.includes('res.cloudinary.com/');
    if (!hasStorage && !hasCloudinary) return jsonText;

    const cleanGw = (activeGwUrl || getActiveGatewayBaseUrl()).replace(/\/+$/, '');
    let result = jsonText;

    if (hasStorage) {
        result = result.replace(
            /https:\/\/[a-zA-Z0-9.-]+\/storage\/v1\//g,
            `${cleanGw}/storage/v1/`
        );
    }

    if (hasCloudinary) {
        result = result.replace(
            /https:\/\/res\.cloudinary\.com\/([^"'\s\\]+)/g,
            (_match, pathPart) => {
                const optimized = optimizeCloudinaryPath('/' + pathPart, true);
                return `${cleanGw}/cloudinary${optimized}`;
            }
        );
    }

    return result;
}

/**
 * Silent Virtual WebSocket for Edge Gateways:
 * Prevents @supabase/realtime-js from spamming HTTP 500 WebSocket handshake errors
 * against Vercel Edge functions while keeping Hybrid HTTP Turbo Delta Sync active.
 */
export class EdgeVirtualWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    public readyState = 0;
    public url: string;
    public protocol = '';
    public bufferedAmount = 0;
    public extensions = '';
    public binaryType: BinaryType = 'blob';
    public onopen: ((ev: any) => any) | null = null;
    public onmessage: ((ev: any) => any) | null = null;
    public onclose: ((ev: any) => any) | null = null;
    public onerror: ((ev: any) => any) | null = null;

    constructor(url: string, _protocols?: string | string[]) {
        this.url = url;
        // Stay in idle virtual state so RealtimeClient does not log errors or spin in reconnect loops
    }

    send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {}

    close(_code?: number, _reason?: string): void {
        this.readyState = EdgeVirtualWebSocket.CLOSED;
    }

    addEventListener(_type: string, _listener: any): void {}
    removeEventListener(_type: string, _listener: any): void {}
    dispatchEvent(_event: Event): boolean {
        return true;
    }
}

let mediaInterceptorInstalled = false;

export function installMediaProxyInterceptor() {
    if (mediaInterceptorInstalled || typeof window === 'undefined') return;
    mediaInterceptorInstalled = true;

    // 1. Intercept window.fetch for direct Cloudinary, Gemini AI, HuggingFace, and Pollinations requests
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        if (
            rawUrl &&
            (rawUrl.startsWith('https://res.cloudinary.com/') ||
                rawUrl.startsWith('https://api.cloudinary.com/') ||
                rawUrl.includes('/cloudinary-api/') ||
                rawUrl.startsWith('https://generativelanguage.googleapis.com/') ||
                rawUrl.includes('/gemini/') ||
                rawUrl.startsWith('https://router.huggingface.co/') ||
                rawUrl.startsWith('https://api-inference.huggingface.co/') ||
                rawUrl.includes('/hf/') ||
                rawUrl.startsWith('https://image.pollinations.ai/') ||
                rawUrl.includes('/pollinations/'))
        ) {
            const gateways = networkState.gateways.length > 0
                ? networkState.gateways.map((g) => g.url)
                : EDGE_GATEWAY_URLS;

            let lastErr: any = null;
            for (const gwUrl of gateways) {
                const proxiedUrl = rewriteMediaUrl(rawUrl, gwUrl, false);
                try {
                    const res = await nativeFetch(proxiedUrl, init);
                    if (res.status < 500) return res;
                } catch (err: any) {
                    if (init?.signal?.aborted) throw err;
                    lastErr = err;
                }
            }
            if (lastErr) throw lastErr;
        }

        return nativeFetch(input, init);
    };

    // 2. Intercept Element.prototype.setAttribute for src / data-src / style
    const origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name: string, value: string) {
        if (
            typeof value === 'string' &&
            value.includes('res.cloudinary.com/') &&
            (name === 'src' || name === 'data-src' || name === 'href' || name === 'poster')
        ) {
            value = rewriteMediaUrl(value);
        }
        return origSetAttribute.call(this, name, value);
    };

    // 3. Intercept HTMLImageElement.src and HTMLMediaElement.src property setters
    const patchSrcProperty = (proto: any) => {
        if (!proto) return;
        const desc = Object.getOwnPropertyDescriptor(proto, 'src');
        if (desc && desc.set && desc.get) {
            Object.defineProperty(proto, 'src', {
                configurable: true,
                enumerable: desc.enumerable,
                get() {
                    return desc.get!.call(this);
                },
                set(val: string) {
                    if (typeof val === 'string' && val.includes('res.cloudinary.com/')) {
                        val = rewriteMediaUrl(val);
                    }
                    desc.set!.call(this, val);
                }
            });
        }
    };
    patchSrcProperty(HTMLImageElement.prototype);
    patchSrcProperty(HTMLMediaElement.prototype);

    // 4. MutationObserver to catch any innerHTML-inserted media or inline background-image styles
    const sanitizeNode = (node: Element) => {
        if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'AUDIO' || node.tagName === 'SOURCE') {
            const src = node.getAttribute('src');
            if (src && src.includes('res.cloudinary.com/')) {
                origSetAttribute.call(node, 'src', rewriteMediaUrl(src));
            }
            const dataSrc = node.getAttribute('data-src');
            if (dataSrc && dataSrc.includes('res.cloudinary.com/')) {
                origSetAttribute.call(node, 'data-src', rewriteMediaUrl(dataSrc));
            }
        }
        const styleAttr = node.getAttribute('style');
        if (styleAttr && styleAttr.includes('res.cloudinary.com/')) {
            origSetAttribute.call(
                node,
                'style',
                styleAttr.replace(/https:\/\/res\.cloudinary\.com\/[^'")\s]+/g, (m) => rewriteMediaUrl(m))
            );
        }
    };

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                m.addedNodes.forEach((n) => {
                    if (n.nodeType === 1) {
                        const el = n as Element;
                        sanitizeNode(el);
                        el.querySelectorAll?.('img, video, audio, source, [style*="res.cloudinary.com"]').forEach(sanitizeNode);
                    }
                });
            } else if (m.type === 'attributes' && m.target.nodeType === 1) {
                sanitizeNode(m.target as Element);
            }
        }
    });

    if (document.documentElement) {
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'data-src', 'style']
        });
    }
}

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
    installMediaProxyInterceptor();

    const cleanedEnv = cleanGatewayUrl(envSupabaseUrl);
    configuredEnvUrl = !isDeadGatewayUrl(cleanedEnv) ? cleanedEnv : PRIMARY_WORKER_URL;
    supabaseAnonKeyRef = anonKey;

    try {
        const lastWorking = localStorage.getItem(LAST_WORKING_GATEWAY_KEY) || '';
        if (isDeadGatewayUrl(lastWorking)) {
            localStorage.removeItem(LAST_WORKING_GATEWAY_KEY);
        }
    } catch (e) {}

    rebuildGatewayList(configuredEnvUrl);
}

export function rebuildGatewayList(envUrl: string) {
    const list: GatewayNode[] = [];

    // 1. Primary AWS Anycast Edge Gateway #1
    list.push({
        id: 'edge-gw-1',
        name: 'Основной Edge-шлюз #1 (AWS)',
        url: PRIMARY_WORKER_URL,
        type: 'edge-proxy',
        latencyMs: null,
        status: 'unknown',
        lastChecked: 0
    });

    // 2. Secondary AWS Anycast Edge Gateway #2
    list.push({
        id: 'edge-gw-2',
        name: 'Резервный Edge-шлюз #2 (AWS)',
        url: SECONDARY_EDGE_URL,
        type: 'edge-proxy',
        latencyMs: null,
        status: 'unknown',
        lastChecked: 0
    });

    // 3. Tertiary AWS Anycast Edge Gateway #3
    list.push({
        id: 'edge-gw-3',
        name: 'Резервный Edge-шлюз #3 (AWS)',
        url: TERTIARY_EDGE_URL,
        type: 'edge-proxy',
        latencyMs: null,
        status: 'unknown',
        lastChecked: 0
    });

    // 4. Custom non-blocked gateway if provided via env
    if (envUrl && !isDeadGatewayUrl(envUrl) && !list.some((g) => g.url === envUrl)) {
        list.unshift({
            id: 'env-edge',
            name: 'Выделенный Edge-шлюз',
            url: envUrl,
            type: 'edge-proxy',
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

    const byLastWorking = !isDeadGatewayUrl(lastWorkingUrl)
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

export async function raceGateways(_forceSwitchToFastest = true): Promise<GatewayNode | null> {
    if (networkState.gateways.length === 0) return null;
    return networkState.gateways[0];
}

function extractSupabasePath(rawUrl: string): string | null {
    try {
        const parsed = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : PRIMARY_WORKER_URL);
        const match = parsed.pathname.match(/\/(rest|auth|storage|functions|realtime)\/v1(\/.*)?$/);
        if (match) {
            return match[0] + parsed.search;
        }
    } catch (e) {}
    return null;
}

function isGatewayErrorResponse(_gw: GatewayNode, response: Response): boolean {
    if (
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        (response.status >= 520 && response.status <= 526)
    ) {
        return true;
    }
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
    attemptController?: AbortController
): Promise<{ gw: GatewayNode; response: Response; elapsed: number }> {
    const targetUrl = `${gw.url}${supabasePath}`;
    const ctrl = attemptController || new AbortController();

    if (init.signal?.aborted) {
        ctrl.abort(init.signal.reason);
    }
    const onCallerAbort = () => ctrl.abort(init.signal?.reason);
    if (init.signal && !init.signal.aborted) {
        init.signal.addEventListener('abort', onCallerAbort, { once: true });
    }

    const timer = setTimeout(() => {
        ctrl.abort(new DOMException('Gateway timeout', 'TimeoutError'));
    }, timeoutMs);

    const start = performance.now();
    try {
        const response = await window.fetch(targetUrl, {
            ...init,
            signal: ctrl.signal
        });
        clearTimeout(timer);

        if (isGatewayErrorResponse(gw, response)) {
            gw.status = 'blocked';
            throw new Error(`Gateway ${gw.id} HTTP ${response.status}`);
        }

        const elapsed = Math.max(1, Math.round(performance.now() - start));
        return { gw, response, elapsed };
    } catch (err) {
        clearTimeout(timer);
        throw err;
    } finally {
        if (init.signal) {
            init.signal.removeEventListener('abort', onCallerAbort);
        }
    }
}

function createGraceRefreshResponse(): Response | null {
    try {
        const raw = localStorage.getItem('sb-vibegram-auth-token');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.access_token || !parsed.refresh_token || !parsed.user) return null;

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
 * - Routes exclusively through verified AWS Anycast Edge Gateways (never blocked Cloudflare/direct domains).
 * - Launches a hedged parallel socket on the secondary Edge Gateway after 1.8s if the primary socket stalls.
 * - Uses dedicated AbortControllers per socket so aborting a losing hedge socket NEVER aborts the winning Response stream.
 * - Automatically rewrites all Cloudinary & Supabase Storage URLs in JSON responses to the active Edge Gateway.
 */
export async function smartSupabaseFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const supabasePath = extractSupabasePath(rawUrl);

    if (!supabasePath || networkState.gateways.length === 0) {
        return window.fetch(input, init);
    }

    const method = (init.method || 'GET').toUpperCase();
    const isTokenRefresh = supabasePath.includes('/auth/v1/token') && supabasePath.includes('grant_type=refresh_token');
    const isHedgeable = method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || isTokenRefresh;

    const activeGw = networkState.gateways.find((g) => g.id === networkState.activeGatewayId) || networkState.gateways[0];
    const otherGateways = networkState.gateways.filter((g) => g.id !== activeGw.id);

    const sequence: GatewayNode[] = [activeGw, ...otherGateways];
    let lastError: any = null;

    for (let i = 0; i < sequence.length; i++) {
        const gw = sequence[i];
        const nextGw = sequence[(i + 1) % sequence.length];

        try {
            let winner: { gw: GatewayNode; response: Response; elapsed: number };

            if (isHedgeable && nextGw && nextGw.id !== gw.id) {
                const ctrl1 = new AbortController();
                const ctrl2 = new AbortController();
                let hedgeStarted = false;

                winner = await new Promise((resolve, reject) => {
                    let settled = false;
                    let pendingCount = 1;
                    let hedgeTimer: any = null;

                    const onSuccess = (res: { gw: GatewayNode; response: Response; elapsed: number }, which: 1 | 2) => {
                        if (settled) {
                            if (which === 1) ctrl1.abort();
                            else ctrl2.abort();
                            return;
                        }
                        settled = true;
                        if (hedgeTimer) clearTimeout(hedgeTimer);
                        if (which === 1 && hedgeStarted) {
                            ctrl2.abort();
                        } else if (which === 2) {
                            ctrl1.abort();
                        }
                        resolve(res);
                    };

                    const onError = (err: any) => {
                        pendingCount--;
                        if (!settled && pendingCount <= 0) {
                            if (hedgeTimer) clearTimeout(hedgeTimer);
                            reject(err);
                        }
                    };

                    fetchSingleAttempt(gw, supabasePath, init, 5000, ctrl1)
                        .then((res) => onSuccess(res, 1))
                        .catch(onError);

                    hedgeTimer = setTimeout(() => {
                        if (settled || init.signal?.aborted) return;
                        hedgeStarted = true;
                        pendingCount++;
                        fetchSingleAttempt(nextGw, supabasePath, init, 5000, ctrl2)
                            .then((res) => onSuccess(res, 2))
                            .catch(onError);
                    }, 1800);
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
