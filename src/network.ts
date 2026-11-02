export interface GatewayNode {
    id: string;
    name: string;
    url: string;
    type: 'custom' | 'edge-proxy' | 'direct' | 'cf-worker';
    latencyMs: number | null;
    status: 'unknown' | 'online' | 'blocked' | 'testing';
    lastChecked: number;
    lastSuccessAt?: number;
    consecutiveFailures?: number;
    supportsWebSocket?: boolean;
}

const CUSTOM_GATEWAY_KEY = 'vibegram_custom_gateway';
const PREFERRED_GATEWAY_KEY = 'vibegram_preferred_gateway_id';
const LAST_WORKING_GATEWAY_KEY = 'vibegram_last_working_gateway_url';

export const DEFAULT_SUPABASE_REF = 'dxoyyflsqrzgzjfihgcx';
export const DIRECT_SUPABASE_URL = `https://${DEFAULT_SUPABASE_REF}.supabase.co`;

// Dedicated Google Cloud Run Europe-West2 Anti-Block Gateways (only valid when running same-origin inside Cloud Run)
export const CLOUD_GATEWAY_PRIMARY_URL = 'https://ais-pre-6cxwdfewxdnz4m3mfqzasb-521433209996.europe-west2.run.app';
export const CLOUD_GATEWAY_SECONDARY_URL = 'https://ais-dev-6cxwdfewxdnz4m3mfqzasb-521433209996.europe-west2.run.app';

function getSameOriginGatewayUrl(): string | null {
    if (typeof window === 'undefined' || !window.location?.origin) return null;
    const host = window.location.hostname.toLowerCase();
    // GitHub Pages is static-only and cannot proxy /rest/v1/* on same-origin
    if (host.includes('github.io')) return null;
    return window.location.origin.replace(/\/+$/, '');
}

const sameOriginUrl = getSameOriginGatewayUrl();

// Dedicated Database & Auth Edge Gateways (verified 200 OK with CORS * and zero redirects from github.io)
export const PRIMARY_WORKER_URL = sameOriginUrl || 'https://vibegram-edge-gw.vercel.app';
export const SECONDARY_EDGE_URL = 'https://vibegram-ru-node.vercel.app';
export const TERTIARY_EDGE_URL = 'https://vibegram-ai-gw.vercel.app';

// Dedicated Media CDN Edge Gateways (routed through verified unblocked edge nodes first)
export const MEDIA_CDN_PRIMARY_URL = sameOriginUrl || 'https://vibegram-edge-gw.vercel.app';
export const MEDIA_CDN_SECONDARY_URL = 'https://vibegram-ru-node.vercel.app';

// Dedicated AI & Server-Side Transcription Edge Gateway
export const AI_GATEWAY_URL = sameOriginUrl || 'https://vibegram-edge-gw.vercel.app';

export const EDGE_GATEWAY_URLS = Array.from(
    new Set([
        ...(sameOriginUrl ? [sameOriginUrl] : []),
        'https://vibegram-edge-gw.vercel.app',
        'https://vibegram-ru-node.vercel.app',
        'https://vibegram-ai-gw.vercel.app',
        DIRECT_SUPABASE_URL
    ])
);

export const MEDIA_GATEWAY_URLS = Array.from(
    new Set([
        ...(sameOriginUrl ? [sameOriginUrl] : []),
        'https://vibegram-edge-gw.vercel.app',
        'https://vibegram-ru-node.vercel.app'
    ])
);

export const AI_GATEWAY_URLS = Array.from(
    new Set([
        ...(sameOriginUrl ? [sameOriginUrl] : []),
        'https://vibegram-edge-gw.vercel.app',
        'https://vibegram-ru-node.vercel.app',
        'https://vibegram-ai-gw.vercel.app'
    ])
);

// Dead or blocked legacy domains that must never be used for Supabase REST/Auth
const DEAD_OR_BLOCKED_DOMAINS = [
    'vibegram.qd.je',
    'supa-proxy.onrender.com',
    'onrender.com',
    'vibegram.qzz.io',
    'vibegram-net-proxy.vercel.app',
    'vibegram-media-cdn.vercel.app',
    'vibegram-media-ru.vercel.app'
];

export function isDeadGatewayUrl(url: string): boolean {
    if (!url || !url.startsWith('http')) return true;
    const lower = url.toLowerCase();
    // Prevent cross-origin requests to AI Studio Cloud Run preview URLs (ais-pre / ais-dev),
    // which return HTTP 302 to /__cookie_check.html when called cross-origin from github.io
    if (lower.includes('ais-pre-') || lower.includes('ais-dev-')) {
        if (!sameOriginUrl || !lower.startsWith(sameOriginUrl.toLowerCase())) {
            return true;
        }
    }
    return DEAD_OR_BLOCKED_DOMAINS.some((d) => lower.includes(d));
}

export function extractSupabaseUrlFromAnonKey(anonKey: string): string {
    if (anonKey && anonKey.includes('.')) {
        try {
            const payloadB64 = anonKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const decoded = JSON.parse(atob(payloadB64));
            if (decoded && typeof decoded.ref === 'string' && decoded.ref.length > 5) {
                return `https://${decoded.ref}.supabase.co`;
            }
        } catch (e) {}
    }
    return DIRECT_SUPABASE_URL;
}

export const networkState = {
    activeGatewayId: sameOriginUrl ? 'same-origin' : 'edge-gw-1',
    activeGatewayUrl: PRIMARY_WORKER_URL,
    activeMediaGatewayUrl: MEDIA_CDN_PRIMARY_URL,
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

export function getActiveMediaGatewayBaseUrl(): string {
    const activeDbGw = networkState.activeGatewayUrl;
    if (
        activeDbGw &&
        !activeDbGw.includes('.supabase.co') &&
        !isDeadGatewayUrl(activeDbGw)
    ) {
        return activeDbGw.replace(/\/+$/, '');
    }
    const mediaGw = networkState.activeMediaGatewayUrl;
    if (mediaGw && !isDeadGatewayUrl(mediaGw)) {
        return mediaGw.replace(/\/+$/, '');
    }
    return MEDIA_CDN_PRIMARY_URL.replace(/\/+$/, '');
}

/**
 * Optimizes Cloudinary image, video, and voice paths on the fly:
 * - Images: f_webp,q_auto:eco,w_960,c_limit (~22 KB WebP)
 * - Voice messages (_voice or audio extensions): f_mp3,br_48k (.mp3, ~25 KB)
 * - Videos & Video Circles (.mov, .mp4, .webm): f_mp4,vc_h264,q_auto:low,w_360,c_limit (.mp4, ~95 KB fast-start)
 */
function optimizeCloudinaryPath(pathAfterDomain: string, addAutoQuality = true): string {
    if (!addAutoQuality) return pathAfterDomain;

    // 1. Optimize images
    const imageMatch = pathAfterDomain.match(/^(\/[^/]+\/image\/upload\/)(?:[^/]+\/)?(v\d+\/.*)$/);
    if (imageMatch) {
        return `${imageMatch[1]}f_webp,q_auto:eco,w_960,c_limit/${imageMatch[2]}`;
    }

    // 2. Optimize videos and voice notes stored under /video/upload/
    const videoMatch = pathAfterDomain.match(/^(\/[^/]+\/video\/upload\/)(?:[^/]+\/)?(v\d+\/.+?)(\.[a-zA-Z0-9]+)?(\?.*)?$/);
    if (videoMatch) {
        const prefix = videoMatch[1];
        const publicIdWithVersion = videoMatch[2];
        const ext = (videoMatch[3] || '').toLowerCase();
        const query = videoMatch[4] || '';
        const lowerId = publicIdWithVersion.toLowerCase();

        const isAudioOnly =
            lowerId.includes('_voice') ||
            lowerId.includes('voice_') ||
            ext === '.mp3' ||
            ext === '.ogg' ||
            ext === '.wav' ||
            ext === '.m4a' ||
            ext === '.aac';

        if (isAudioOnly) {
            return `${prefix}f_mp3,br_48k/${publicIdWithVersion}.mp3${query}`;
        }

        return `${prefix}f_mp4,vc_h264,q_auto:low,w_360,c_limit/${publicIdWithVersion}.mp4${query}`;
    }

    return pathAfterDomain;
}

/**
 * Generates an instant ~6KB WebP first-frame poster URL for any Cloudinary video or video_circle
 * so chat bubbles display a preview frame in <80ms before the video stream even buffers.
 */
export function getVideoPosterUrl(rawVideoUrl: string | null | undefined): string {
    if (!rawVideoUrl || typeof rawVideoUrl !== 'string') return '';
    const proxied = rewriteMediaUrl(rawVideoUrl, undefined, false);
    const match = proxied.match(/^(https?:\/\/[^/]+(?:\/cloudinary)?\/[^/]+\/video\/upload\/)(?:[^/]+\/)?(v\d+\/.+?)(\.[a-zA-Z0-9]+)?(\?.*)?$/);
    if (match) {
        return `${match[1]}f_webp,so_0,w_320,c_limit,q_auto:low/${match[2]}.webp`;
    }
    return '';
}

/**
 * Generates an ultra-lightweight mono 16kHz 32kbps MP3 audio stream URL from any Cloudinary video/audio URL.
 * Cuts video circle and voice payload by 85-95% for sub-second Gemini transcription.
 */
export function getOptimizedAudioForTranscriptionUrl(rawMediaUrl: string): string {
    if (!rawMediaUrl || typeof rawMediaUrl !== 'string') return rawMediaUrl;
    const proxied = rewriteMediaUrl(rawMediaUrl, undefined, false);
    const match = proxied.match(/^(https?:\/\/[^/]+(?:\/cloudinary)?\/[^/]+\/video\/upload\/)(?:[^/]+\/)?(v\d+\/.+?)(\.[a-zA-Z0-9]+)?(\?.*)?$/);
    if (match) {
        return `${match[1]}f_mp3,br_32k,ac_1,ar_16000/${match[2]}.mp3`;
    }
    return proxied;
}

/**
 * Rewrites media or AI URLs:
 * - Cloudinary media (res.cloudinary.com or legacy /cloudinary/ proxy URLs) defaults to direct
 *   optimized https://res.cloudinary.com/... so Vercel Edge Gateways are never flooded or reset by TSPU.
 *   When targetGwUrl is explicitly passed (during fallback), routes via that Edge Gateway.
 * - AI APIs (Gemini, HuggingFace, Pollinations) and Supabase Storage route via active working Edge Gateways.
 */
export function rewriteMediaUrl(rawUrl: string | null | undefined, targetGwUrl?: string, addAutoQuality = true): string {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl || '';
    const trimmed = rawUrl.trim();
    if (!trimmed.startsWith('http')) return trimmed;

    const explicitProxyGw =
        targetGwUrl && !targetGwUrl.includes('res.cloudinary.com') && !targetGwUrl.includes('.supabase.co')
            ? targetGwUrl.replace(/\/+$/, '')
            : '';
    const aiGw = (targetGwUrl || getActiveMediaGatewayBaseUrl()).replace(/\/+$/, '');
    const dbGw = (targetGwUrl || getActiveGatewayBaseUrl()).replace(/\/+$/, '');

    // 1. Direct res.cloudinary.com URLs
    if (trimmed.startsWith('https://res.cloudinary.com/')) {
        let rest = trimmed.substring('https://res.cloudinary.com'.length);
        rest = rest
            .replace(/\/video\/upload\/[^/]+\/v(\d+)\//, '/video/upload/v$1/')
            .replace(/\/image\/upload\/[^/]+\/v(\d+)\//, '/image/upload/v$1/');
        rest = optimizeCloudinaryPath(rest, addAutoQuality);
        return explicitProxyGw ? `${explicitProxyGw}/cloudinary${rest}` : `https://res.cloudinary.com${rest}`;
    }

    // 2. Previously-proxied /cloudinary/ URLs -> normalize back to direct res.cloudinary.com unless explicitProxyGw is requested
    const existingCloudinaryIdx = trimmed.indexOf('/cloudinary/');
    if (existingCloudinaryIdx !== -1) {
        let rest = trimmed.substring(existingCloudinaryIdx + '/cloudinary'.length);
        rest = rest
            .replace(/\/video\/upload\/[^/]+\/v(\d+)\//, '/video/upload/v$1/')
            .replace(/\/image\/upload\/[^/]+\/v(\d+)\//, '/image/upload/v$1/');
        if (addAutoQuality) {
            rest = optimizeCloudinaryPath(rest, true);
        }
        return explicitProxyGw ? `${explicitProxyGw}/cloudinary${rest}` : `https://res.cloudinary.com${rest}`;
    }

    // 3. Direct api.cloudinary.com upload/destroy URLs
    if (trimmed.startsWith('https://api.cloudinary.com/')) {
        const rest = trimmed.substring('https://api.cloudinary.com'.length);
        return explicitProxyGw ? `${explicitProxyGw}/cloudinary-api${rest}` : `https://api.cloudinary.com${rest}`;
    }
    const existingCloudApiIdx = trimmed.indexOf('/cloudinary-api/');
    if (existingCloudApiIdx !== -1) {
        const rest = trimmed.substring(existingCloudApiIdx + '/cloudinary-api'.length);
        return explicitProxyGw ? `${explicitProxyGw}/cloudinary-api${rest}` : `https://api.cloudinary.com${rest}`;
    }

    // 4. Google Gemini API URLs -> Active Edge Gateway
    if (trimmed.startsWith('https://generativelanguage.googleapis.com/')) {
        const rest = trimmed.substring('https://generativelanguage.googleapis.com'.length);
        return `${aiGw}/gemini${rest}`;
    }
    const existingGeminiIdx = trimmed.indexOf('/gemini/');
    if (existingGeminiIdx !== -1) {
        const rest = trimmed.substring(existingGeminiIdx + '/gemini'.length);
        return `${aiGw}/gemini${rest}`;
    }

    // 5. HuggingFace Router / Inference URLs -> Active Edge Gateway
    if (trimmed.startsWith('https://router.huggingface.co/')) {
        const rest = trimmed.substring('https://router.huggingface.co'.length);
        return `${aiGw}/hf${rest}`;
    }
    if (trimmed.startsWith('https://api-inference.huggingface.co/')) {
        const rest = trimmed.substring('https://api-inference.huggingface.co'.length);
        return `${aiGw}/hf${rest}`;
    }
    const existingHfIdx = trimmed.indexOf('/hf/');
    if (existingHfIdx !== -1) {
        const rest = trimmed.substring(existingHfIdx + '/hf'.length);
        return `${aiGw}/hf${rest}`;
    }

    // 6. Pollinations AI Image Generation URLs -> Active Edge Gateway
    if (trimmed.startsWith('https://image.pollinations.ai/')) {
        const rest = trimmed.substring('https://image.pollinations.ai'.length);
        return `${aiGw}/pollinations${rest}`;
    }
    const existingPollinationsIdx = trimmed.indexOf('/pollinations/');
    if (existingPollinationsIdx !== -1) {
        const rest = trimmed.substring(existingPollinationsIdx + '/pollinations'.length);
        return `${aiGw}/pollinations${rest}`;
    }

    // 7. Legacy or direct Supabase storage URLs
    const storageIdx = trimmed.indexOf('/storage/v1/');
    if (storageIdx !== -1) {
        const rest = trimmed.substring(storageIdx);
        return `${dbGw}${rest}`;
    }

    return trimmed;
}

/**
 * Rewrites all legacy/proxied storage and Cloudinary URLs inside raw JSON text
 * before JSON.parse() runs, normalizing Cloudinary media to direct optimized https://res.cloudinary.com/...
 * so Vercel gateways are never overloaded by concurrent image/video downloads.
 */
export function rewriteLegacyStorageUrlsInJson(jsonText: string, activeGwUrl?: string): string {
    if (!jsonText) return jsonText;
    const hasStorage = jsonText.includes('/storage/v1/');
    const hasCloudinary = jsonText.includes('res.cloudinary.com/') || jsonText.includes('/cloudinary/');
    if (!hasStorage && !hasCloudinary) return jsonText;

    const cleanDbGw = (activeGwUrl || getActiveGatewayBaseUrl()).replace(/\/+$/, '');
    let result = jsonText;

    if (hasStorage) {
        result = result.replace(
            /https?:\/\/[a-zA-Z0-9.:-]+\/storage\/v1\//g,
            `${cleanDbGw}/storage/v1/`
        );
    }

    if (hasCloudinary) {
        result = result.replace(
            /https?:\/\/res\.cloudinary\.com\/([^"'\s\\]+)/g,
            (_match, pathPart) => {
                const cleanPath = ('/' + pathPart)
                    .replace(/\/video\/upload\/[^/]+\/v(\d+)\//, '/video/upload/v$1/')
                    .replace(/\/image\/upload\/[^/]+\/v(\d+)\//, '/image/upload/v$1/');
                const optimized = optimizeCloudinaryPath(cleanPath, true);
                return `https://res.cloudinary.com${optimized}`;
            }
        );
        result = result.replace(
            /https?:\/\/[a-zA-Z0-9.:-]+\/cloudinary\/([^"'\s\\]+)/g,
            (_match, pathPart) => {
                const cleanPath = ('/' + pathPart)
                    .replace(/\/video\/upload\/[^/]+\/v(\d+)\//, '/video/upload/v$1/')
                    .replace(/\/image\/upload\/[^/]+\/v(\d+)\//, '/image/upload/v$1/');
                const optimized = optimizeCloudinaryPath(cleanPath, true);
                return `https://res.cloudinary.com${optimized}`;
            }
        );
    }

    return result;
}

/**
 * Smart Anti-Block WebSocket Adapter:
 * Connects to the active WebSocket-capable gateway (Same-Origin, Cloud Run Gateway, or Direct Supabase)
 * for instant <50ms Realtime Postgres Changes, Broadcasts, and WebRTC signaling.
 * If the network blocks WebSockets, it fails over silently to HTTP Turbo Delta Sync without console error spam.
 */
export class EdgeVirtualWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    public readyState = EdgeVirtualWebSocket.CONNECTING;
    public url: string;
    public protocol = '';
    public bufferedAmount = 0;
    public extensions = '';
    public binaryType: BinaryType = 'blob';
    public onopen: ((ev: any) => any) | null = null;
    public onmessage: ((ev: any) => any) | null = null;
    public onclose: ((ev: any) => any) | null = null;
    public onerror: ((ev: any) => any) | null = null;

    private realWs: WebSocket | null = null;
    private listeners = new Map<string, Set<any>>();

    constructor(url: string, protocols?: string | string[]) {
        const wsGwNode =
            networkState.gateways.find(
                (g) => g.supportsWebSocket && g.status !== 'blocked' && !g.url.includes('.vercel.app') && !g.url.includes('.netlify.app')
            ) || null;

        this.url = this.rewriteRealtimeWsUrl(url, wsGwNode?.url);

        if (!wsGwNode) {
            this.readyState = EdgeVirtualWebSocket.CLOSED;
            setRealtimeConnectedState(false);
            return;
        }

        try {
            const NativeWS = typeof window !== 'undefined' ? window.WebSocket : undefined;
            if (!NativeWS) {
                this.readyState = EdgeVirtualWebSocket.CLOSED;
                return;
            }

            const ws = protocols ? new NativeWS(this.url, protocols) : new NativeWS(this.url);
            this.realWs = ws;

            ws.onopen = (ev) => {
                this.readyState = EdgeVirtualWebSocket.OPEN;
                this.protocol = ws.protocol || '';
                setRealtimeConnectedState(true);
                if (this.onopen) this.onopen(ev);
                this.emit('open', ev);
            };

            ws.onmessage = (ev) => {
                if (this.onmessage) this.onmessage(ev);
                this.emit('message', ev);
            };

            ws.onclose = (ev) => {
                this.readyState = EdgeVirtualWebSocket.CLOSED;
                setRealtimeConnectedState(false);
                if (this.onclose) this.onclose(ev);
                this.emit('close', ev);
            };

            ws.onerror = (ev) => {
                setRealtimeConnectedState(false);
                if (this.onerror) this.onerror(ev);
                this.emit('error', ev);
            };
        } catch {
            this.readyState = EdgeVirtualWebSocket.CLOSED;
        }
    }

    private rewriteRealtimeWsUrl(rawUrl: string, targetBaseUrl?: string): string {
        try {
            const parsed = new URL(rawUrl);
            const activeGw = (targetBaseUrl || getActiveGatewayBaseUrl()).replace(/\/+$/, '');
            const gwParsed = new URL(activeGw);
            const wsProto = gwParsed.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${wsProto}//${gwParsed.host}${parsed.pathname}${parsed.search}`;
        } catch {
            return rawUrl;
        }
    }

    private emit(type: string, ev: any) {
        const set = this.listeners.get(type);
        if (set) {
            set.forEach((fn) => {
                try {
                    fn(ev);
                } catch {}
            });
        }
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        if (this.realWs && this.realWs.readyState === EdgeVirtualWebSocket.OPEN) {
            try {
                this.realWs.send(data);
            } catch {}
        }
    }

    close(code?: number, reason?: string): void {
        this.readyState = EdgeVirtualWebSocket.CLOSED;
        if (this.realWs) {
            try {
                if (
                    this.realWs.readyState === EdgeVirtualWebSocket.OPEN ||
                    this.realWs.readyState === EdgeVirtualWebSocket.CONNECTING
                ) {
                    const safeCode = code && code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006 ? code : 1000;
                    this.realWs.close(safeCode, reason);
                }
            } catch {}
        }
    }

    addEventListener(type: string, listener: any): void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type)!.add(listener);
    }

    removeEventListener(type: string, listener: any): void {
        this.listeners.get(type)?.delete(listener);
    }

    dispatchEvent(_event: Event): boolean {
        return true;
    }
}

let mediaInterceptorInstalled = false;
let nativeWindowFetch: typeof window.fetch | null = null;

export function installMediaProxyInterceptor() {
    if (mediaInterceptorInstalled || typeof window === 'undefined') return;
    mediaInterceptorInstalled = true;

    // 1. Intercept window.fetch for Cloudinary, Gemini AI, HuggingFace, and Pollinations requests
    const nativeFetch = window.fetch.bind(window);
    nativeWindowFetch = nativeFetch;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        if (
            rawUrl &&
            (rawUrl.startsWith('https://res.cloudinary.com/') ||
                rawUrl.startsWith('https://api.cloudinary.com/') ||
                rawUrl.includes('/cloudinary/') ||
                rawUrl.includes('/cloudinary-api/') ||
                rawUrl.startsWith('https://generativelanguage.googleapis.com/') ||
                rawUrl.includes('/gemini/') ||
                rawUrl.startsWith('https://router.huggingface.co/') ||
                rawUrl.startsWith('https://api-inference.huggingface.co/') ||
                rawUrl.includes('/hf/') ||
                rawUrl.startsWith('https://image.pollinations.ai/') ||
                rawUrl.includes('/pollinations/'))
        ) {
            const isAiRequest =
                rawUrl.startsWith('https://generativelanguage.googleapis.com/') ||
                rawUrl.includes('/gemini/') ||
                rawUrl.startsWith('https://router.huggingface.co/') ||
                rawUrl.startsWith('https://api-inference.huggingface.co/') ||
                rawUrl.includes('/hf/') ||
                rawUrl.startsWith('https://image.pollinations.ai/') ||
                rawUrl.includes('/pollinations/');

            // For Cloudinary media/API, try direct Cloudinary CDN first so Vercel gateways are not throttled
            if (!isAiRequest) {
                const directUrl = rewriteMediaUrl(rawUrl, undefined, false);
                try {
                    const directRes = await nativeFetch(directUrl, init);
                    if (directRes.status < 500) {
                        return directRes;
                    }
                } catch (err: any) {
                    if (init?.signal?.aborted) throw err;
                }
            }

            const gateways = isAiRequest ? AI_GATEWAY_URLS : MEDIA_GATEWAY_URLS;

            let lastErr: any = null;
            for (const gwUrl of gateways) {
                const proxiedUrl = rewriteMediaUrl(rawUrl, gwUrl, false);
                try {
                    const res = await nativeFetch(proxiedUrl, init);
                    if (res.status < 500) {
                        if (!isAiRequest && networkState.activeMediaGatewayUrl !== gwUrl) {
                            networkState.activeMediaGatewayUrl = gwUrl;
                        }
                        return res;
                    }
                } catch (err: any) {
                    if (init?.signal?.aborted) throw err;
                    lastErr = err;
                }
            }
            if (lastErr) throw lastErr;
        }

        return nativeFetch(input, init);
    };

    const needsMediaRewrite = (val: string) =>
        typeof val === 'string' &&
        (val.includes('/cloudinary/') ||
            val.includes('res.cloudinary.com/') ||
            val.includes('supa-proxy.onrender.com/') ||
            val.includes('vibegram.qd.je/') ||
            val.includes('vibegram.qzz.io/') ||
            val.includes('vibegram-media-cdn.vercel.app/') ||
            val.includes('vibegram-media-ru.vercel.app/') ||
            val.includes('vibegram-net-proxy.vercel.app/'));

    // 2. Intercept Element.prototype.setAttribute for src / data-src / style
    const origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name: string, value: string) {
        if (
            name === 'src' &&
            this instanceof HTMLElement &&
            this.hasAttribute('data-direct-cdn')
        ) {
            return origSetAttribute.call(this, name, value);
        }
        if (
            needsMediaRewrite(value) &&
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
                    if (
                        !(this instanceof HTMLElement && this.hasAttribute('data-direct-cdn')) &&
                        needsMediaRewrite(val)
                    ) {
                        val = rewriteMediaUrl(val);
                    }
                    desc.set!.call(this, val);
                }
            });
        }
    };
    patchSrcProperty(HTMLImageElement.prototype);
    patchSrcProperty(HTMLMediaElement.prototype);

    // 4. Global capture-phase media error listener so ANY <img>, <video>, or <audio> (even without inline onerror)
    // automatically fails over across direct Cloudinary -> wsrv.nl -> online Edge Gateway -> IndexedDB Blob
    window.addEventListener(
        'error',
        (event: ErrorEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target || !(target instanceof HTMLElement)) return;
            if (target.tagName !== 'IMG' && target.tagName !== 'VIDEO' && target.tagName !== 'AUDIO') return;
            // If element already has an inline onerror attribute, let its handler run without double-firing
            if (target.hasAttribute('onerror')) return;
            const currentSrc = (target as HTMLImageElement | HTMLMediaElement).src || target.getAttribute('src') || '';
            if (!currentSrc || !currentSrc.startsWith('http')) return;
            if (typeof (window as any).handleMediaError === 'function') {
                (window as any).handleMediaError(target, currentSrc);
            }
        },
        true
    );

    // 5. MutationObserver to catch any innerHTML-inserted media or inline background-image styles
    const sanitizeNode = (node: Element) => {
        if (node.hasAttribute('data-direct-cdn')) return;
        if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'AUDIO' || node.tagName === 'SOURCE') {
            const src = node.getAttribute('src');
            if (src && needsMediaRewrite(src)) {
                const rewritten = rewriteMediaUrl(src);
                if (rewritten !== src) origSetAttribute.call(node, 'src', rewritten);
            }
            const dataSrc = node.getAttribute('data-src');
            if (dataSrc && needsMediaRewrite(dataSrc)) {
                const rewritten = rewriteMediaUrl(dataSrc);
                if (rewritten !== dataSrc) origSetAttribute.call(node, 'data-src', rewritten);
            }
            const poster = node.getAttribute('poster');
            if (poster && needsMediaRewrite(poster)) {
                const rewritten = rewriteMediaUrl(poster);
                if (rewritten !== poster) origSetAttribute.call(node, 'poster', rewritten);
            }
        }
        const styleAttr = node.getAttribute('style');
        if (
            styleAttr &&
            (styleAttr.includes('/cloudinary/') ||
                styleAttr.includes('res.cloudinary.com/') ||
                styleAttr.includes('vibegram-media-cdn.vercel.app/') ||
                styleAttr.includes('vibegram-media-ru.vercel.app/'))
        ) {
            const updatedStyle = styleAttr.replace(
                /https?:\/\/[^'")\s]+\/cloudinary\/[^'")\s]+|https?:\/\/res\.cloudinary\.com\/[^'")\s]+/g,
                (m) => rewriteMediaUrl(m)
            );
            if (updatedStyle !== styleAttr) {
                origSetAttribute.call(node, 'style', updatedStyle);
            }
        }
    };

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                m.addedNodes.forEach((n) => {
                    if (n.nodeType === 1) {
                        const el = n as Element;
                        sanitizeNode(el);
                        el.querySelectorAll?.('img, video, audio, source, [style*="cloudinary"]').forEach(sanitizeNode);
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
            attributeFilter: ['src', 'data-src', 'poster', 'style']
        });
    }
}

const inflightMediaFetches = new Map<string, Promise<Blob>>();

/**
 * Fetches a media file (video, audio, image, document) starting with direct Cloudinary CDN / wsrv.nl,
 * then falling back to verified online Edge Gateways and 48KB chunked HTTP Range requests if needed.
 */
export async function fetchMediaBlobResilient(
    rawUrl: string,
    signal?: AbortSignal,
    addAutoQuality = true
): Promise<Blob> {
    if (!rawUrl) throw new Error('Empty media URL');
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
        const res = await fetch(rawUrl, { signal });
        return await res.blob();
    }

    const cacheKey = `${rawUrl}|${addAutoQuality ? 'opt' : 'raw'}`;
    if (!signal && inflightMediaFetches.has(cacheKey)) {
        return inflightMediaFetches.get(cacheKey)!;
    }

    const run = async (): Promise<Blob> => {
        const fetchFn = nativeWindowFetch || window.fetch.bind(window);
        let lastErr: any = null;

        // Pass 1: Direct Cloudinary CDN first (avoids hitting Vercel gateways for binary media)
        const directCloudinaryUrl = rewriteMediaUrl(rawUrl, undefined, addAutoQuality);
        if (directCloudinaryUrl) {
            const ctrl = new AbortController();
            const onAbort = () => ctrl.abort();
            signal?.addEventListener('abort', onAbort, { once: true });
            const timer = setTimeout(() => ctrl.abort(), 7500);
            try {
                const res = await fetchFn(directCloudinaryUrl, { signal: ctrl.signal });
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    clearTimeout(timer);
                    if (buf.byteLength > 0) {
                        const ct = res.headers.get('content-type') || 'application/octet-stream';
                        return new Blob([buf], { type: ct });
                    }
                }
                clearTimeout(timer);
            } catch (err) {
                clearTimeout(timer);
                if (signal?.aborted) throw err;
                lastErr = err;
            } finally {
                signal?.removeEventListener('abort', onAbort);
            }
        }

        // Pass 1.5: For images/posters, fallback immediately to wsrv.nl global CDN
        const isLikelyImage =
            /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(rawUrl) || rawUrl.includes('/image/upload/');
        if (isLikelyImage && directCloudinaryUrl.startsWith('https://res.cloudinary.com/')) {
            try {
                const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(directCloudinaryUrl)}&output=webp&q=80`;
                const res = await fetchFn(wsrvUrl, { signal });
                if (res.ok) {
                    return await res.blob();
                }
            } catch (err) {
                if (signal?.aborted) throw err;
                lastErr = err;
            }
        }

        const gateways = MEDIA_GATEWAY_URLS.filter((gwUrl) => {
            const node = networkState.gateways.find((g) => g.url === gwUrl);
            return !node || node.status !== 'blocked';
        });
        const candidateGateways = gateways.length > 0 ? gateways : MEDIA_GATEWAY_URLS;

        // Pass 2: Standard full-body fetch across online Edge Gateways
        for (const gwUrl of candidateGateways.slice(0, 2)) {
            const targetUrl = rewriteMediaUrl(rawUrl, gwUrl, addAutoQuality);
            const ctrl = new AbortController();
            const onAbort = () => ctrl.abort();
            signal?.addEventListener('abort', onAbort, { once: true });
            const timer = setTimeout(() => ctrl.abort(), 8000);

            try {
                const res = await fetchFn(targetUrl, { signal: ctrl.signal });
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    clearTimeout(timer);
                    if (buf.byteLength > 0) {
                        const ct = res.headers.get('content-type') || 'application/octet-stream';
                        return new Blob([buf], { type: ct });
                    }
                }
                clearTimeout(timer);
            } catch (err) {
                clearTimeout(timer);
                if (signal?.aborted) throw err;
                lastErr = err;
            } finally {
                signal?.removeEventListener('abort', onAbort);
            }
        }

        // Pass 3: Chunked HTTP Range Fetch (48KB slices) on active Edge Gateway
        for (const gwUrl of candidateGateways.slice(0, 2)) {
            const targetUrl = rewriteMediaUrl(rawUrl, gwUrl, addAutoQuality);
            try {
                const chunks: ArrayBuffer[] = [];
                const CHUNK_SIZE = 49152; // 48 KB
                let offset = 0;
                let totalSize = -1;
                let contentType = 'video/mp4';

                while (totalSize === -1 || offset < totalSize) {
                    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                    const end = offset + CHUNK_SIZE - 1;
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 6000);
                    try {
                        const res = await fetchFn(targetUrl, {
                            headers: { Range: `bytes=${offset}-${end}` },
                            signal: ctrl.signal
                        });
                        const buf = await res.arrayBuffer();
                        clearTimeout(timer);

                        if (res.status === 200) {
                            const ct = res.headers.get('content-type') || contentType;
                            return new Blob([buf], { type: ct });
                        }
                        if (res.status !== 206 || buf.byteLength === 0) {
                            break;
                        }

                        const ct = res.headers.get('content-type');
                        if (ct) contentType = ct;

                        const contentRange = res.headers.get('content-range') || '';
                        const match = contentRange.match(/bytes\s+\d+-\d+\/(\d+)/i);
                        if (match && match[1]) {
                            totalSize = parseInt(match[1], 10);
                        }

                        chunks.push(buf);
                        offset += buf.byteLength;
                        if (buf.byteLength < CHUNK_SIZE || offset >= 15 * 1024 * 1024) {
                            break;
                        }
                    } catch (chunkErr) {
                        clearTimeout(timer);
                        throw chunkErr;
                    }
                }

                if (chunks.length > 0 && (totalSize === -1 || offset >= totalSize)) {
                    return new Blob(chunks, { type: contentType });
                }
            } catch (err) {
                if (signal?.aborted) throw err;
                lastErr = err;
            }
        }

        throw lastErr || new Error('Media fetch failed across all gateways');
    };

    const promise = run().finally(() => {
        inflightMediaFetches.delete(cacheKey);
    });
    if (!signal) {
        inflightMediaFetches.set(cacheKey, promise);
    }
    return promise;
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
        if (!val) return '';
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
            localStorage.setItem(LAST_WORKING_GATEWAY_KEY, cleaned);
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
let configuredBackupUrl = '';
let supabaseAnonKeyRef = '';
let wakeListenersInstalled = false;
let lastHiddenOrIdleAt = Date.now();
let isRecoveringFromWake = false;

export function getJwtExpSeconds(token: string | null | undefined): number {
    if (!token || typeof token !== 'string' || !token.includes('.')) return 0;
    try {
        const parts = token.split('.');
        if (parts.length < 2) return 0;
        const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = JSON.parse(atob(payloadB64));
        if (decoded && typeof decoded.exp === 'number' && decoded.exp > 0) {
            return decoded.exp;
        }
    } catch (e) {}
    return 0;
}

export function repairStoredAuthSession(): { accessToken: string; refreshToken: string; realExp: number } | null {
    try {
        const raw = localStorage.getItem('sb-vibegram-auth-token');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.access_token || !parsed.refresh_token) return null;
        const realExp = getJwtExpSeconds(parsed.access_token);
        if (realExp > 0) {
            const nowSec = Math.floor(Date.now() / 1000);
            if (!parsed.expires_at || parsed.expires_at > realExp) {
                parsed.expires_at = realExp;
                parsed.expires_in = Math.max(0, realExp - nowSec);
                localStorage.setItem('sb-vibegram-auth-token', JSON.stringify(parsed));
            }
        }
        return {
            accessToken: parsed.access_token,
            refreshToken: parsed.refresh_token,
            realExp
        };
    } catch (e) {
        return null;
    }
}

let inflightDirectRefreshPromise: Promise<string | null> | null = null;

export async function refreshAccessTokenDirect(): Promise<string | null> {
    if (inflightDirectRefreshPromise) return inflightDirectRefreshPromise;

    inflightDirectRefreshPromise = (async () => {
        try {
            const sessionInfo = repairStoredAuthSession();
            if (!sessionInfo || !sessionInfo.refreshToken) return null;

            const raw = localStorage.getItem('sb-vibegram-auth-token');
            const parsed = raw ? JSON.parse(raw) : null;
            const fetchFn = nativeWindowFetch || window.fetch.bind(window);
            const refreshPath = '/auth/v1/token?grant_type=refresh_token';

            const candidates =
                networkState.gateways.length > 0
                    ? [
                          networkState.gateways.find((g) => g.id === networkState.activeGatewayId) || networkState.gateways[0],
                          ...networkState.gateways.filter((g) => g.id !== networkState.activeGatewayId)
                      ]
                    : [];

            for (const gw of candidates) {
                if (!gw) continue;
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 7000);
                try {
                    const headers: Record<string, string> = {
                        'Content-Type': 'application/json;charset=UTF-8'
                    };
                    if (supabaseAnonKeyRef) {
                        headers['apikey'] = supabaseAnonKeyRef;
                        headers['Authorization'] = `Bearer ${supabaseAnonKeyRef}`;
                    }
                    const res = await fetchFn(`${gw.url}${refreshPath}`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ refresh_token: sessionInfo.refreshToken }),
                        signal: ctrl.signal
                    });
                    clearTimeout(timer);

                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.access_token && data.refresh_token) {
                            const realExp = getJwtExpSeconds(data.access_token);
                            const nowSec = Math.floor(Date.now() / 1000);
                            const updatedSession = {
                                ...(parsed || {}),
                                ...data,
                                expires_at: realExp > 0 ? realExp : data.expires_at || nowSec + (data.expires_in || 3600),
                                expires_in: realExp > 0 ? Math.max(60, realExp - nowSec) : data.expires_in || 3600
                            };
                            localStorage.setItem('sb-vibegram-auth-token', JSON.stringify(updatedSession));
                            gw.status = 'online';
                            networkState.activeGatewayId = gw.id;
                            networkState.activeGatewayUrl = gw.url;
                            notifyNetworkState();
                            return data.access_token as string;
                        }
                    } else if (res.status === 400 || res.status === 401) {
                        // Check if another tab already refreshed the token in localStorage
                        const latest = repairStoredAuthSession();
                        if (latest && latest.accessToken !== sessionInfo.accessToken && latest.realExp > Math.floor(Date.now() / 1000) + 30) {
                            return latest.accessToken;
                        }
                    }
                } catch {
                    clearTimeout(timer);
                }
            }
            return null;
        } catch {
            return null;
        } finally {
            inflightDirectRefreshPromise = null;
        }
    })();

    return inflightDirectRefreshPromise;
}

function installWakeRecoveryListeners() {
    if (wakeListenersInstalled || typeof window === 'undefined') return;
    wakeListenersInstalled = true;

    const handleWakeOrOnline = async (forceProbe = false) => {
        if (isRecoveringFromWake) return;
        const now = Date.now();
        const idleMs = now - lastHiddenOrIdleAt;
        const anyBlocked = networkState.gateways.some((g) => g.status === 'blocked');
        const allBlocked = networkState.gateways.length > 0 && networkState.gateways.every((g) => g.status === 'blocked');
        const sessionInfo = repairStoredAuthSession();
        const nowSec = Math.floor(now / 1000);
        const tokenNeedsRefresh = sessionInfo && sessionInfo.realExp > 0 && sessionInfo.realExp <= nowSec + 300;

        if (!forceProbe && idleMs < 15000 && !anyBlocked && !tokenNeedsRefresh && networkState.transportMode !== 'offline') {
            return;
        }

        isRecoveringFromWake = true;
        try {
            // Clear stale blocked flags so gateways are immediately usable on wake
            if (anyBlocked || allBlocked || networkState.transportMode === 'offline') {
                networkState.gateways.forEach((g) => {
                    if (g.status === 'blocked') {
                        g.status = 'unknown';
                    }
                });
                if (networkState.transportMode === 'offline') {
                    networkState.transportMode = networkState.realtimeConnected ? 'websocket' : 'http-turbo';
                }
                notifyNetworkState();
            }

            if (tokenNeedsRefresh) {
                await refreshAccessTokenDirect();
            }

            await raceGateways(true);

            // Trigger immediate UI/data sync after waking up
            const logicRef = (window as any).logic;
            if (logicRef) {
                if (typeof logicRef.loadChats === 'function') {
                    logicRef.loadChats();
                }
                if (typeof logicRef.pollActiveChatDelta === 'function') {
                    logicRef.pollActiveChatDelta();
                }
            }
        } catch (e) {
            // Silent recovery
        } finally {
            lastHiddenOrIdleAt = Date.now();
            isRecoveringFromWake = false;
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            lastHiddenOrIdleAt = Date.now();
        } else {
            handleWakeOrOnline(false);
        }
    });

    window.addEventListener('focus', () => {
        handleWakeOrOnline(false);
    });

    window.addEventListener('online', () => {
        handleWakeOrOnline(true);
    });

    // Periodic 45s health & token check while the tab stays open for 30+ minutes
    setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        const sessionInfo = repairStoredAuthSession();
        const nowSec = Math.floor(Date.now() / 1000);
        if (sessionInfo && sessionInfo.realExp > 0 && sessionInfo.realExp <= nowSec + 240) {
            refreshAccessTokenDirect();
        }
        const allBlocked = networkState.gateways.length > 0 && networkState.gateways.every((g) => g.status === 'blocked');
        if (allBlocked || networkState.transportMode === 'offline') {
            handleWakeOrOnline(true);
        }
    }, 45000);
}

export function initNetworkManager(envSupabaseUrl: string, anonKey: string, backupSupabaseUrl = '') {
    installMediaProxyInterceptor();

    // Allow instant one-click gateway binding via ?gw=https://... URL parameter
    if (typeof window !== 'undefined' && window.location?.search) {
        try {
            const params = new URLSearchParams(window.location.search);
            const gwParam = cleanGatewayUrl(params.get('gw') || params.get('gateway') || '');
            if (gwParam && !isDeadGatewayUrl(gwParam)) {
                localStorage.setItem(CUSTOM_GATEWAY_KEY, gwParam);
                localStorage.setItem(PREFERRED_GATEWAY_KEY, 'custom');
                localStorage.setItem(LAST_WORKING_GATEWAY_KEY, gwParam);
            }
        } catch (e) {}
    }

    const cleanedEnv = cleanGatewayUrl(envSupabaseUrl);
    configuredEnvUrl = !isDeadGatewayUrl(cleanedEnv) ? cleanedEnv : PRIMARY_WORKER_URL;

    const cleanedBackup = cleanGatewayUrl(backupSupabaseUrl);
    configuredBackupUrl = !isDeadGatewayUrl(cleanedBackup) ? cleanedBackup : '';

    supabaseAnonKeyRef = anonKey;

    try {
        const lastWorking = localStorage.getItem(LAST_WORKING_GATEWAY_KEY) || '';
        if (isDeadGatewayUrl(lastWorking)) {
            localStorage.removeItem(LAST_WORKING_GATEWAY_KEY);
        }
    } catch (e) {}

    repairStoredAuthSession();
    rebuildGatewayList(configuredEnvUrl);
    installWakeRecoveryListeners();

    // Run non-blocking background speed race on startup so gateway latencies and statuses are populated immediately
    if (typeof window !== 'undefined') {
        setTimeout(() => {
            raceGateways(true).catch(() => {});
        }, 120);
    }
}

export function rebuildGatewayList(envUrl: string) {
    const list: GatewayNode[] = [];
    const customUrl = getCustomGatewayUrl();
    const directUrl = extractSupabaseUrlFromAnonKey(supabaseAnonKeyRef);

    // 1. User's Custom Gateway (if set in Settings or via ?gw=...)
    if (customUrl && !customUrl.includes('.supabase.co')) {
        list.push({
            id: 'custom',
            name: 'Пользовательский шлюз (Mirror)',
            url: customUrl,
            type: 'custom',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: !customUrl.includes('.vercel.app')
        });
    }

    // 2. Local / Same-Origin Server Gateway (when hosted on Cloud Run / Node server / Docker Space)
    if (sameOriginUrl) {
        list.push({
            id: 'same-origin',
            name: 'Встроенный турбо-шлюз (Прямой туннель)',
            url: sameOriginUrl,
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: !sameOriginUrl.includes('.vercel.app')
        });
    }

    // 3. Primary Edge Gateway #1 (vibegram-edge-gw.vercel.app)
    if (!list.some((g) => g.url === 'https://vibegram-edge-gw.vercel.app')) {
        list.push({
            id: 'edge-gw-1',
            name: 'Основной Edge-шлюз #1 (EU/RU)',
            url: 'https://vibegram-edge-gw.vercel.app',
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: false
        });
    }

    // 4. Direct Supabase Endpoint (Cloudflare ASN — native WebSockets + independent ASN fallback)
    if (!list.some((g) => g.url === directUrl)) {
        list.push({
            id: 'direct-supabase',
            name: 'Прямое соединение Supabase',
            url: directUrl,
            type: 'direct',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: true
        });
    }

    // 5. Secondary Edge Gateway #2 (vibegram-ru-node.vercel.app)
    if (!list.some((g) => g.url === 'https://vibegram-ru-node.vercel.app')) {
        list.push({
            id: 'edge-gw-2',
            name: 'Резервный Edge-шлюз #2 (RU-Node)',
            url: 'https://vibegram-ru-node.vercel.app',
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: false
        });
    }

    // 6. Tertiary Edge Gateway #3 (vibegram-ai-gw.vercel.app)
    if (!list.some((g) => g.url === 'https://vibegram-ai-gw.vercel.app')) {
        list.push({
            id: 'edge-gw-3',
            name: 'Резервный Edge-шлюз #3 (AI-Node)',
            url: 'https://vibegram-ai-gw.vercel.app',
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: false
        });
    }

    // 7. Dedicated Edge Gateway from SUPABASE_URL env/secret (if distinct)
    if (envUrl && !isDeadGatewayUrl(envUrl) && envUrl !== directUrl && !envUrl.includes('.supabase.co') && !list.some((g) => g.url === envUrl)) {
        list.push({
            id: 'env-edge',
            name: 'Выделенный Edge-шлюз (Secret)',
            url: envUrl,
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: !envUrl.includes('.vercel.app')
        });
    }

    // 8. Backup Edge Gateway from SUPABASE_BACKUP_URL env/secret
    if (
        configuredBackupUrl &&
        !isDeadGatewayUrl(configuredBackupUrl) &&
        configuredBackupUrl !== directUrl &&
        !configuredBackupUrl.includes('.supabase.co') &&
        !list.some((g) => g.url === configuredBackupUrl)
    ) {
        list.push({
            id: 'env-backup-edge',
            name: 'Резервный Edge-шлюз (Backup)',
            url: configuredBackupUrl,
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: !configuredBackupUrl.includes('.vercel.app')
        });
    }

    for (const item of list) {
        const prev = networkState.gateways.find((p) => p.url === item.url);
        if (prev) {
            item.latencyMs = prev.latencyMs;
            item.status = prev.status;
            item.lastChecked = prev.lastChecked;
            item.lastSuccessAt = prev.lastSuccessAt;
            item.consecutiveFailures = prev.consecutiveFailures;
        }
    }

    networkState.gateways = list;

    let lastWorkingUrl = '';
    try {
        lastWorkingUrl = localStorage.getItem(LAST_WORKING_GATEWAY_KEY) || '';
    } catch (e) {}

    const byLastWorking =
        lastWorkingUrl && !isDeadGatewayUrl(lastWorkingUrl)
            ? list.find((g) => g.url === lastWorkingUrl && g.status !== 'blocked')
            : undefined;
    const chosen = (customUrl ? list.find((g) => g.id === 'custom') : undefined) || byLastWorking || list[0];

    if (chosen) {
        networkState.activeGatewayId = chosen.id;
        networkState.activeGatewayUrl = chosen.url;
    }
}

export function selectGatewayById(id: string) {
    const found = networkState.gateways.find((g) => g.id === id);
    if (!found) return;
    found.status = 'online';
    found.consecutiveFailures = 0;
    found.lastSuccessAt = Date.now();
    networkState.activeGatewayId = found.id;
    networkState.activeGatewayUrl = found.url;
    try {
        localStorage.setItem(LAST_WORKING_GATEWAY_KEY, found.url);
    } catch (e) {}
    notifyNetworkState();
}

function markGatewaySuccess(gw: GatewayNode, elapsedMs: number) {
    const now = Date.now();
    gw.latencyMs = Math.max(1, elapsedMs);
    gw.status = 'online';
    gw.lastChecked = now;
    gw.lastSuccessAt = now;
    gw.consecutiveFailures = 0;
    networkState.lastPingMs = gw.latencyMs;
}

function markGatewayFailure(gw: GatewayNode) {
    const now = Date.now();
    gw.lastChecked = now;
    gw.consecutiveFailures = (gw.consecutiveFailures || 0) + 1;

    // Never mark a gateway as 'blocked' if it succeeded within the last 25s or has an active WebSocket connection
    const recentlySucceeded = gw.lastSuccessAt && now - gw.lastSuccessAt < 25000;
    const hasActiveWs = gw.supportsWebSocket && networkState.realtimeConnected;
    if (recentlySucceeded || hasActiveWs) {
        gw.status = 'online';
        return;
    }

    if ((gw.consecutiveFailures || 0) >= 2) {
        gw.status = 'blocked';
        gw.latencyMs = null;
    }
}

let activeRacePromise: Promise<GatewayNode | null> | null = null;

export async function raceGateways(forceSwitchToFastest = true): Promise<GatewayNode | null> {
    if (networkState.gateways.length === 0) return null;
    if (activeRacePromise) return activeRacePromise;

    activeRacePromise = (async () => {
        const fetchFn = nativeWindowFetch || window.fetch.bind(window);
        const probePath = '/rest/v1/profiles?select=id&limit=1';

        const probeOneGateway = async (gw: GatewayNode, timeoutMs: number): Promise<boolean> => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeoutMs);
            const start = performance.now();
            try {
                const headers: Record<string, string> = {};
                if (supabaseAnonKeyRef) {
                    headers['apikey'] = supabaseAnonKeyRef;
                    headers['Authorization'] = `Bearer ${supabaseAnonKeyRef}`;
                }
                const res = await fetchFn(`${gw.url}${probePath}`, {
                    method: 'GET',
                    headers,
                    cache: 'no-store',
                    signal: ctrl.signal
                });
                await res.arrayBuffer();
                clearTimeout(timer);
                if (!isGatewayErrorResponse(gw, res) && res.status < 500) {
                    const elapsed = Math.max(1, Math.round(performance.now() - start));
                    markGatewaySuccess(gw, elapsed);
                    return true;
                }
            } catch {
                clearTimeout(timer);
            }
            return false;
        };

        await Promise.all(
            networkState.gateways.map(async (gw) => {
                const prevLatency = gw.latencyMs;
                const prevSuccessAt = gw.lastSuccessAt || 0;
                gw.status = 'testing';
                notifyNetworkState();

                let ok = await probeOneGateway(gw, 9500);
                if (!ok) {
                    await new Promise((r) => setTimeout(r, 250));
                    ok = await probeOneGateway(gw, 9500);
                }

                if (!ok) {
                    const now = Date.now();
                    // Preserve online state if WebSocket is actively connected on this gateway or a real query succeeded recently
                    if ((gw.supportsWebSocket && networkState.realtimeConnected) || (prevSuccessAt > 0 && now - prevSuccessAt < 30000)) {
                        gw.status = 'online';
                        gw.latencyMs = prevLatency || networkState.lastPingMs || 220;
                    } else {
                        gw.latencyMs = null;
                        gw.status = 'blocked';
                    }
                    gw.lastChecked = now;
                }
                notifyNetworkState();
            })
        );

        const onlineNodes = networkState.gateways
            .filter((g) => g.status === 'online' && g.latencyMs !== null)
            .sort((a, b) => (a.latencyMs || 9999) - (b.latencyMs || 9999));

        if (onlineNodes.length > 0 && forceSwitchToFastest) {
            const fastest = onlineNodes[0];
            networkState.activeGatewayId = fastest.id;
            networkState.activeGatewayUrl = fastest.url;
            networkState.lastPingMs = fastest.latencyMs;
            if (networkState.transportMode === 'offline' || networkState.transportMode === 'connecting') {
                networkState.transportMode = networkState.realtimeConnected ? 'websocket' : 'http-turbo';
            }
            try {
                localStorage.setItem(LAST_WORKING_GATEWAY_KEY, fastest.url);
            } catch {}
        } else if (onlineNodes.length === 0) {
            // Never leave all gateways red ('blocked') if the network had a momentary stall
            const activeNode =
                networkState.gateways.find((g) => g.id === networkState.activeGatewayId) || networkState.gateways[0];
            if (activeNode) {
                activeNode.status = networkState.lastPingMs ? 'online' : 'unknown';
                if (networkState.lastPingMs && !activeNode.latencyMs) {
                    activeNode.latencyMs = networkState.lastPingMs;
                }
            }
        }

        notifyNetworkState();
        return onlineNodes[0] || networkState.gateways[0];
    })().finally(() => {
        activeRacePromise = null;
    });

    return activeRacePromise;
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
    headerTimeoutMs: number,
    attemptController?: AbortController
): Promise<{ gw: GatewayNode; response: Response; bodyBuffer: ArrayBuffer; elapsed: number }> {
    const targetUrl = `${gw.url}${supabasePath}`;
    const ctrl = attemptController || new AbortController();
    const fetchFn = nativeWindowFetch || window.fetch.bind(window);

    if (init.signal?.aborted) {
        ctrl.abort(init.signal.reason);
    }
    const onCallerAbort = () => ctrl.abort(init.signal?.reason);
    if (init.signal && !init.signal.aborted) {
        init.signal.addEventListener('abort', onCallerAbort, { once: true });
    }

    let timer: any = setTimeout(() => {
        ctrl.abort(new DOMException('Gateway connection timeout', 'TimeoutError'));
    }, headerTimeoutMs);

    const start = performance.now();
    try {
        const response = await fetchFn(targetUrl, {
            ...init,
            signal: ctrl.signal
        });

        clearTimeout(timer);

        if (isGatewayErrorResponse(gw, response)) {
            markGatewayFailure(gw);
            throw new Error(`Gateway ${gw.id} HTTP ${response.status}`);
        }

        // Once headers arrive, give up to 14 seconds for downloading the response body
        timer = setTimeout(() => {
            ctrl.abort(new DOMException('Gateway body timeout', 'TimeoutError'));
        }, 14000);

        const bodyBuffer = await response.arrayBuffer();
        clearTimeout(timer);

        const elapsed = Math.max(1, Math.round(performance.now() - start));
        return { gw, response, bodyBuffer, elapsed };
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

        const nowSec = Math.floor(Date.now() / 1000);
        const realExp = getJwtExpSeconds(parsed.access_token);
        // Never return a fake 200 OK if the JWT is already expired or expiring within 15 seconds
        if (realExp > 0 && realExp <= nowSec + 15) {
            return null;
        }

        const safeExp = realExp > 0 ? realExp : nowSec + 60;
        const graceSession = {
            ...parsed,
            expires_in: Math.max(15, safeExp - nowSec),
            expires_at: safeExp
        };
        return new Response(JSON.stringify(graceSession), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return null;
    }
}

function updateAuthorizationHeaderInInit(init: RequestInit, newAccessToken: string): RequestInit {
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${newAccessToken}`);
    return {
        ...init,
        headers
    };
}

function getBearerTokenFromInit(init: RequestInit): string | null {
    try {
        const headers = new Headers(init.headers || {});
        const auth = headers.get('Authorization') || headers.get('authorization');
        if (auth && auth.startsWith('Bearer ')) {
            return auth.substring(7).trim();
        }
    } catch {}
    return null;
}

/**
 * Resilient Fetch Engine for Supabase:
 * - Uses Happy Eyeballs (RFC 8305) staggered racing across distinct ASNs (Vercel Edge + Cloudflare Direct Supabase)
 *   so if one provider is throttled or reset by TSPU, the other responds in <300ms instead of waiting 8+ seconds
 * - Automatically repairs and refreshes expired JWTs after 30+ minutes of idle/background sleep
 * - Never overwrites an active/online gateway to 'blocked' on a single slow parallel request
 */
export async function smartSupabaseFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
    isRetryAfter401 = false
): Promise<Response> {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const supabasePath = extractSupabasePath(rawUrl);

    if (!supabasePath || networkState.gateways.length === 0) {
        return window.fetch(input, init);
    }

    // Suppress non-essential HTTP broadcast fallback spam when WebSocket is disconnected
    if (supabasePath.includes('/realtime/v1/api/broadcast')) {
        return new Response(JSON.stringify({ status: 'ok' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const isTokenRefresh = supabasePath.includes('/auth/v1/token') && supabasePath.includes('grant_type=refresh_token');
    const isRestOrStorage = supabasePath.startsWith('/rest/v1/') || supabasePath.startsWith('/storage/v1/');
    const method = (init.method || 'GET').toUpperCase();
    const isIdempotentGet = method === 'GET' || method === 'HEAD';

    // Proactively check if the attached user JWT is expired before hitting PostgREST
    let effectiveInit = init;
    if (isRestOrStorage && !isRetryAfter401) {
        const bearer = getBearerTokenFromInit(effectiveInit);
        if (bearer && bearer !== supabaseAnonKeyRef) {
            const expSec = getJwtExpSeconds(bearer);
            const nowSec = Math.floor(Date.now() / 1000);
            if (expSec > 0 && expSec <= nowSec + 10) {
                const refreshedToken = await refreshAccessTokenDirect();
                if (refreshedToken) {
                    effectiveInit = updateAuthorizationHeaderInInit(effectiveInit, refreshedToken);
                }
            }
        }
    }

    const now = Date.now();
    // If all gateways were previously marked blocked, clear their blocked status so we don't get stuck
    if (networkState.gateways.every((g) => g.status === 'blocked')) {
        networkState.gateways.forEach((g) => {
            g.status = 'unknown';
            g.consecutiveFailures = 0;
        });
    }

    const currentActive = networkState.gateways.find((g) => g.id === networkState.activeGatewayId) || networkState.gateways[0];
    const otherGateways = networkState.gateways.filter((g) => g.id !== currentActive.id);

    // Ensure distinct provider family is placed second so if Vercel is blocked, Direct Supabase is tried next (and vice versa)
    const isActiveVercel = currentActive.url.includes('.vercel.app');
    const orderedCandidates = [currentActive, ...otherGateways].sort((a, b) => {
        if (a.id === currentActive.id) return -1;
        if (b.id === currentActive.id) return 1;
        const aRecentlyBlocked = a.status === 'blocked' && now - a.lastChecked < 12000 ? 1 : 0;
        const bRecentlyBlocked = b.status === 'blocked' && now - b.lastChecked < 12000 ? 1 : 0;
        if (aRecentlyBlocked !== bRecentlyBlocked) return aRecentlyBlocked - bRecentlyBlocked;
        const aDiffProvider = a.url.includes('.vercel.app') !== isActiveVercel ? 0 : 1;
        const bDiffProvider = b.url.includes('.vercel.app') !== isActiveVercel ? 0 : 1;
        return aDiffProvider - bDiffProvider;
    });

    let lastError: any = null;

    const finalizeWinnerResponse = async (winner: {
        gw: GatewayNode;
        response: Response;
        bodyBuffer: ArrayBuffer;
        elapsed: number;
    }): Promise<Response> => {
        markGatewaySuccess(winner.gw, winner.elapsed);

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

        const status = winner.response.status;

        // If PostgREST returned 401 (JWT expired after 30+ min idle), refresh token once and transparently retry
        if (status === 401 && isRestOrStorage && !isRetryAfter401) {
            const refreshedToken = await refreshAccessTokenDirect();
            if (refreshedToken) {
                const retryInit = updateAuthorizationHeaderInInit(effectiveInit, refreshedToken);
                return smartSupabaseFetch(input, retryInit, true);
            }
        }

        const isNullBodyStatus = status === 204 || status === 205 || status === 304;
        const safeHeaders = new Headers(winner.response.headers);
        safeHeaders.delete('content-encoding');
        safeHeaders.delete('content-length');

        if (isNullBodyStatus || winner.bodyBuffer.byteLength === 0) {
            return new Response(null, {
                status,
                statusText: winner.response.statusText,
                headers: safeHeaders
            });
        }

        const contentType = safeHeaders.get('content-type') || '';
        if (supabasePath.startsWith('/rest/v1/') && contentType.includes('application/json')) {
            try {
                const rawText = new TextDecoder('utf-8').decode(winner.bodyBuffer);
                const rewrittenText = rewriteLegacyStorageUrlsInJson(rawText, winner.gw.url);
                return new Response(rewrittenText, {
                    status,
                    statusText: winner.response.statusText,
                    headers: safeHeaders
                });
            } catch (e) {
                // Fallback to fresh Response from bodyBuffer below
            }
        }

        return new Response(winner.bodyBuffer, {
            status,
            statusText: winner.response.statusText,
            headers: safeHeaders
        });
    };

    const primaryGw = orderedCandidates[0];
    const secondaryGw = orderedCandidates[1];
    const primaryRecentlyVerified =
        primaryGw &&
        primaryGw.status === 'online' &&
        primaryGw.lastSuccessAt &&
        now - primaryGw.lastSuccessAt < 20000 &&
        (primaryGw.latencyMs || 0) < 2500;

    // Happy Eyeballs fast failover for GET requests when primary gateway is not freshly verified (<2.5s):
    // Give primary 850ms head start; if it hasn't answered or resets, launch secondary (different ASN) in parallel
    let startIndex = 0;
    if (isIdempotentGet && primaryGw && secondaryGw && !primaryRecentlyVerified) {
        startIndex = 2;
        const ctrl1 = new AbortController();
        const ctrl2 = new AbortController();
        let staggerTimer: any = null;

        try {
            const p1 = fetchSingleAttempt(primaryGw, supabasePath, effectiveInit, 7500, ctrl1).catch((err) => {
                markGatewayFailure(primaryGw);
                throw err;
            });

            const p2 = new Promise<{ gw: GatewayNode; response: Response; bodyBuffer: ArrayBuffer; elapsed: number }>(
                (resolve, reject) => {
                    const launchSecond = () => {
                        if (ctrl2.signal.aborted) return;
                        fetchSingleAttempt(secondaryGw, supabasePath, effectiveInit, 7500, ctrl2)
                            .then(resolve)
                            .catch((err) => {
                                markGatewayFailure(secondaryGw);
                                reject(err);
                            });
                    };
                    staggerTimer = setTimeout(launchSecond, 850);
                    // Also launch second immediately if primary fails before 850ms
                    p1.catch(() => {
                        clearTimeout(staggerTimer);
                        launchSecond();
                    });
                }
            );

            const winner = await Promise.any([p1, p2]);
            clearTimeout(staggerTimer);
            if (winner.gw.id === primaryGw.id) {
                ctrl2.abort();
            } else {
                ctrl1.abort();
            }
            return await finalizeWinnerResponse(winner);
        } catch (aggErr: any) {
            clearTimeout(staggerTimer);
            lastError = aggErr?.errors?.[0] || aggErr;
            if (effectiveInit.signal?.aborted) {
                throw lastError;
            }
        }
    }

    for (let i = startIndex; i < orderedCandidates.length; i++) {
        const gw = orderedCandidates[i];
        const attemptHeaderTimeoutMs = i === 0 ? 7000 : 8000;

        try {
            const winner = await fetchSingleAttempt(gw, supabasePath, effectiveInit, attemptHeaderTimeoutMs);
            return await finalizeWinnerResponse(winner);
        } catch (err: any) {
            lastError = err;
            if (effectiveInit.signal?.aborted) {
                throw err;
            }
            markGatewayFailure(gw);
        }
    }

    // Wake-from-sleep / transient network recovery pass:
    // Wait 600ms for the OS network interface to finish waking up and retry Direct + Primary Edge
    if (!effectiveInit.signal?.aborted) {
        await new Promise((r) => setTimeout(r, 600));
        const directGw = networkState.gateways.find((g) => g.type === 'direct');
        const edgePrimary = networkState.gateways.find((g) => g.id === 'edge-gw-1') || networkState.gateways[0];
        const recoveryTargets = Array.from(new Set([directGw, edgePrimary].filter(Boolean) as GatewayNode[]));

        for (const gw of recoveryTargets) {
            if (effectiveInit.signal?.aborted) break;
            try {
                const winner = await fetchSingleAttempt(gw, supabasePath, effectiveInit, 9500);
                return await finalizeWinnerResponse(winner);
            } catch (err: any) {
                lastError = err;
            }
        }
    }

    // Never leave all gateways stuck in 'blocked' state if the device briefly lost connection
    if (networkState.gateways.every((g) => g.status === 'blocked')) {
        const fallbackGw =
            networkState.gateways.find((g) => g.id === networkState.activeGatewayId) ||
            networkState.gateways.find((g) => g.id === 'edge-gw-1') ||
            networkState.gateways[0];
        if (fallbackGw) {
            fallbackGw.status = networkState.lastPingMs ? 'online' : 'unknown';
            fallbackGw.consecutiveFailures = 0;
        }
    }

    if (isTokenRefresh) {
        const graceRes = createGraceRefreshResponse();
        if (graceRes) {
            return graceRes;
        }
    }

    notifyNetworkState();
    throw lastError || new Error('Failed to fetch from gateways');
}

export function setRealtimeConnectedState(connected: boolean) {
    networkState.realtimeConnected = connected;
    if (connected) {
        networkState.transportMode = 'websocket';
        // When WebSocket is connected, mark the WebSocket-capable gateway (Direct Supabase / Same-Origin) as online
        const wsGw = networkState.gateways.find(
            (g) => g.supportsWebSocket && !g.url.includes('.vercel.app')
        );
        if (wsGw) {
            wsGw.status = 'online';
            wsGw.lastSuccessAt = Date.now();
            wsGw.consecutiveFailures = 0;
            if (wsGw.latencyMs === null) {
                wsGw.latencyMs = networkState.lastPingMs || 150;
            }
        }
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
