export interface GatewayNode {
    id: string;
    name: string;
    url: string;
    type: 'custom' | 'edge-proxy' | 'direct' | 'cf-worker';
    latencyMs: number | null;
    status: 'unknown' | 'online' | 'blocked' | 'testing';
    lastChecked: number;
    supportsWebSocket?: boolean;
}

const CUSTOM_GATEWAY_KEY = 'vibegram_custom_gateway';
const PREFERRED_GATEWAY_KEY = 'vibegram_preferred_gateway_id';
const LAST_WORKING_GATEWAY_KEY = 'vibegram_last_working_gateway_url';

export const DEFAULT_SUPABASE_REF = 'dxoyyflsqrzgzjfihgcx';
export const DIRECT_SUPABASE_URL = `https://${DEFAULT_SUPABASE_REF}.supabase.co`;

// Dedicated Google Cloud Run Europe-West2 Anti-Block Gateways (HTTP/2 + WebSocket + Media Range Streaming)
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

// Dedicated Database & Auth Edge Gateways
export const PRIMARY_WORKER_URL = sameOriginUrl || CLOUD_GATEWAY_PRIMARY_URL;
export const SECONDARY_EDGE_URL = CLOUD_GATEWAY_PRIMARY_URL;
export const TERTIARY_EDGE_URL = DIRECT_SUPABASE_URL;

// Dedicated Media CDN Edge Gateways (verified working for /cloudinary/* and /cloudinary-api/*)
export const MEDIA_CDN_PRIMARY_URL = sameOriginUrl || 'https://vibegram-media-cdn.vercel.app';
export const MEDIA_CDN_SECONDARY_URL = 'https://vibegram-media-ru.vercel.app';

// Dedicated AI & Server-Side Transcription Edge Gateway
export const AI_GATEWAY_URL = sameOriginUrl || 'https://vibegram-ai-gw.vercel.app';

export const EDGE_GATEWAY_URLS = Array.from(
    new Set([
        ...(sameOriginUrl ? [sameOriginUrl] : []),
        CLOUD_GATEWAY_PRIMARY_URL,
        CLOUD_GATEWAY_SECONDARY_URL,
        DIRECT_SUPABASE_URL
    ])
);

export const MEDIA_GATEWAY_URLS = Array.from(
    new Set([
        ...(sameOriginUrl ? [sameOriginUrl] : []),
        'https://vibegram-media-cdn.vercel.app',
        CLOUD_GATEWAY_PRIMARY_URL,
        'https://vibegram-media-ru.vercel.app',
        CLOUD_GATEWAY_SECONDARY_URL
    ])
);

export const AI_GATEWAY_URLS = Array.from(
    new Set([
        ...(sameOriginUrl ? [sameOriginUrl] : []),
        'https://vibegram-ai-gw.vercel.app',
        CLOUD_GATEWAY_PRIMARY_URL,
        'https://vibegram-media-cdn.vercel.app'
    ])
);

// Dead or misconfigured DB proxy domains that must never be used for Supabase REST/Auth
const DEAD_OR_BLOCKED_DOMAINS = [
    'vibegram.qd.je',
    'supa-proxy.onrender.com',
    'onrender.com',
    'vibegram.qzz.io',
    'vibegram-edge-gw.vercel.app',
    'vibegram-ru-node.vercel.app',
    'vibegram-net-proxy.vercel.app'
];

export function isDeadGatewayUrl(url: string): boolean {
    if (!url || !url.startsWith('http')) return true;
    const lower = url.toLowerCase();
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
    activeGatewayId: sameOriginUrl ? 'same-origin' : 'cloud-gw-1',
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
    return (networkState.activeMediaGatewayUrl || MEDIA_CDN_PRIMARY_URL).replace(/\/+$/, '');
}

/**
 * Optimizes Cloudinary image, video, and voice paths on the fly:
 * - Images: f_auto,q_auto:good,w_1280,c_limit (~40 KB WebP/AVIF)
 * - Voice messages (_voice or audio extensions): f_mp3,br_64k (.mp3, ~35 KB)
 * - Videos & Video Circles (.mov, .mp4, .webm): f_mp4,vc_h264,q_auto:eco,w_480,c_limit (.mp4)
 */
function optimizeCloudinaryPath(pathAfterDomain: string, addAutoQuality = true): string {
    if (!addAutoQuality) return pathAfterDomain;

    // 1. Optimize images
    const imageMatch = pathAfterDomain.match(/^(\/[^/]+\/image\/upload\/)(v\d+\/.*)$/);
    if (imageMatch) {
        return `${imageMatch[1]}f_auto,q_auto:good,w_1280,c_limit/${imageMatch[2]}`;
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
            return `${prefix}f_mp3,br_64k/${publicIdWithVersion}.mp3${query}`;
        }

        return `${prefix}f_mp4,vc_h264,q_auto:eco,w_480,c_limit/${publicIdWithVersion}.mp4${query}`;
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
 * to route through the dedicated Media CDN or AI Edge Gateways.
 */
export function rewriteMediaUrl(rawUrl: string | null | undefined, targetGwUrl?: string, addAutoQuality = true): string {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl || '';
    const trimmed = rawUrl.trim();
    if (!trimmed.startsWith('http')) return trimmed;

    const mediaGw = (targetGwUrl || getActiveMediaGatewayBaseUrl()).replace(/\/+$/, '');
    const aiGw = (targetGwUrl || AI_GATEWAY_URL).replace(/\/+$/, '');
    const dbGw = (targetGwUrl || getActiveGatewayBaseUrl()).replace(/\/+$/, '');

    // 1. Direct res.cloudinary.com URLs -> Dedicated Media CDN Gateway
    if (trimmed.startsWith('https://res.cloudinary.com/')) {
        const rest = optimizeCloudinaryPath(trimmed.substring('https://res.cloudinary.com'.length), addAutoQuality);
        return `${mediaGw}/cloudinary${rest}`;
    }

    // 2. Already-proxied /cloudinary/ URLs when switching gateways or optimizing
    const existingCloudinaryIdx = trimmed.indexOf('/cloudinary/');
    if (existingCloudinaryIdx !== -1) {
        let rest = trimmed.substring(existingCloudinaryIdx + '/cloudinary'.length);
        rest = rest
            .replace(/\/video\/upload\/[^/]+\/v(\d+)\//, '/video/upload/v$1/')
            .replace(/\/image\/upload\/[^/]+\/v(\d+)\//, '/image/upload/v$1/');
        if (addAutoQuality) {
            rest = optimizeCloudinaryPath(rest, true);
        }
        return `${mediaGw}/cloudinary${rest}`;
    }

    // 3. Direct api.cloudinary.com upload/destroy URLs -> Dedicated Media CDN Gateway
    if (trimmed.startsWith('https://api.cloudinary.com/')) {
        const rest = trimmed.substring('https://api.cloudinary.com'.length);
        return `${mediaGw}/cloudinary-api${rest}`;
    }
    const existingCloudApiIdx = trimmed.indexOf('/cloudinary-api/');
    if (existingCloudApiIdx !== -1) {
        const rest = trimmed.substring(existingCloudApiIdx + '/cloudinary-api'.length);
        return `${mediaGw}/cloudinary-api${rest}`;
    }

    // 4. Google Gemini API URLs -> Dedicated AI Gateway
    if (trimmed.startsWith('https://generativelanguage.googleapis.com/')) {
        const rest = trimmed.substring('https://generativelanguage.googleapis.com'.length);
        return `${aiGw}/gemini${rest}`;
    }
    const existingGeminiIdx = trimmed.indexOf('/gemini/');
    if (existingGeminiIdx !== -1) {
        const rest = trimmed.substring(existingGeminiIdx + '/gemini'.length);
        return `${aiGw}/gemini${rest}`;
    }

    // 5. HuggingFace Router / Inference URLs -> Dedicated AI Gateway
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

    // 6. Pollinations AI Image Generation URLs -> Dedicated AI Gateway
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
 * Rewrites all blocked storage and Cloudinary URLs inside raw JSON text
 * before JSON.parse() runs, so both network responses and localStorage caches
 * immediately point to our working Media CDN & DB Edge Gateways.
 */
export function rewriteLegacyStorageUrlsInJson(jsonText: string, activeGwUrl?: string): string {
    if (!jsonText) return jsonText;
    const hasStorage = jsonText.includes('/storage/v1/');
    const hasCloudinary = jsonText.includes('res.cloudinary.com/') || jsonText.includes('/cloudinary/');
    if (!hasStorage && !hasCloudinary) return jsonText;

    const cleanDbGw = (activeGwUrl || getActiveGatewayBaseUrl()).replace(/\/+$/, '');
    const cleanMediaGw = getActiveMediaGatewayBaseUrl();
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
                const optimized = optimizeCloudinaryPath('/' + pathPart, true);
                return `${cleanMediaGw}/cloudinary${optimized}`;
            }
        );
        result = result.replace(
            /https?:\/\/[a-zA-Z0-9.:-]+\/cloudinary\/([^"'\s\\]+)/g,
            (_match, pathPart) => {
                const cleanPath = ('/' + pathPart)
                    .replace(/\/video\/upload\/[^/]+\/v(\d+)\//, '/video/upload/v$1/')
                    .replace(/\/image\/upload\/[^/]+\/v(\d+)\//, '/image/upload/v$1/');
                const optimized = optimizeCloudinaryPath(cleanPath, true);
                return `${cleanMediaGw}/cloudinary${optimized}`;
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
        this.url = this.rewriteRealtimeWsUrl(url);
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

    private rewriteRealtimeWsUrl(rawUrl: string): string {
        try {
            const parsed = new URL(rawUrl);
            const activeGw = getActiveGatewayBaseUrl();
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

    // 1. Intercept window.fetch for direct Cloudinary, Gemini AI, HuggingFace, and Pollinations requests
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
        (val.includes('res.cloudinary.com/') ||
            val.includes('supa-proxy.onrender.com/') ||
            val.includes('vibegram.qd.je/') ||
            val.includes('vibegram.qzz.io/') ||
            (val.includes('/cloudinary/') && (val.endsWith('.mov') || val.includes('.mov?'))));

    // 2. Intercept Element.prototype.setAttribute for src / data-src / style
    const origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name: string, value: string) {
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
                    if (needsMediaRewrite(val)) {
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
            if (src && needsMediaRewrite(src)) {
                origSetAttribute.call(node, 'src', rewriteMediaUrl(src));
            }
            const dataSrc = node.getAttribute('data-src');
            if (dataSrc && needsMediaRewrite(dataSrc)) {
                origSetAttribute.call(node, 'data-src', rewriteMediaUrl(dataSrc));
            }
        }
        const styleAttr = node.getAttribute('style');
        if (styleAttr && styleAttr.includes('res.cloudinary.com/')) {
            origSetAttribute.call(
                node,
                'style',
                styleAttr.replace(/https?:\/\/res\.cloudinary\.com\/[^'")\s]+/g, (m) => rewriteMediaUrl(m))
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
    const customUrl = getCustomGatewayUrl();

    // 1. User's Custom Gateway (if set in Settings)
    if (customUrl) {
        list.push({
            id: 'custom',
            name: 'Пользовательский шлюз (Mirror)',
            url: customUrl,
            type: 'custom',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: true
        });
    }

    // 2. Local / Same-Origin Server Gateway (when hosted on Cloud Run / Node server)
    if (sameOriginUrl) {
        list.push({
            id: 'same-origin',
            name: 'Встроенный турбо-шлюз (Прямой туннель)',
            url: sameOriginUrl,
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: true
        });
    }

    // 3. Primary Google Cloud Europe-West2 Anti-Block Gateway #1
    if (!list.some((g) => g.url === CLOUD_GATEWAY_PRIMARY_URL)) {
        list.push({
            id: 'cloud-gw-1',
            name: 'Основной облачный шлюз #1 (EU-West)',
            url: CLOUD_GATEWAY_PRIMARY_URL,
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: true
        });
    }

    // 4. Secondary Google Cloud Europe-West2 Anti-Block Gateway #2
    if (!list.some((g) => g.url === CLOUD_GATEWAY_SECONDARY_URL)) {
        list.push({
            id: 'cloud-gw-2',
            name: 'Резервный облачный шлюз #2 (EU-West)',
            url: CLOUD_GATEWAY_SECONDARY_URL,
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: true
        });
    }

    // 5. Direct Supabase Endpoint (Fallback when direct route is open)
    const directUrl = extractSupabaseUrlFromAnonKey(supabaseAnonKeyRef);
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

    // 6. Custom non-blocked gateway if provided via env
    if (envUrl && !isDeadGatewayUrl(envUrl) && !list.some((g) => g.url === envUrl)) {
        list.unshift({
            id: 'env-edge',
            name: 'Выделенный Edge-шлюз',
            url: envUrl,
            type: 'edge-proxy',
            latencyMs: null,
            status: 'unknown',
            lastChecked: 0,
            supportsWebSocket: true
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
    const chosen = (customUrl ? list.find((g) => g.id === 'custom') : undefined) || byLastWorking || list[0];

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
    const fetchFn = nativeWindowFetch || window.fetch.bind(window);
    const probePath = '/rest/v1/profiles?select=id&limit=1';

    await Promise.all(
        networkState.gateways.map(async (gw) => {
            gw.status = 'testing';
            notifyNetworkState();
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
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
                    signal: ctrl.signal
                });
                clearTimeout(timer);
                if (!isGatewayErrorResponse(gw, res) && res.status < 500) {
                    gw.latencyMs = Math.max(1, Math.round(performance.now() - start));
                    gw.status = 'online';
                } else {
                    gw.status = 'blocked';
                }
            } catch {
                clearTimeout(timer);
                gw.status = 'blocked';
            } finally {
                gw.lastChecked = Date.now();
            }
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
        try {
            localStorage.setItem(LAST_WORKING_GATEWAY_KEY, fastest.url);
        } catch {}
    }

    notifyNetworkState();
    return onlineNodes[0] || networkState.gateways[0];
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
    const fetchFn = nativeWindowFetch || window.fetch.bind(window);

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
        const response = await fetchFn(targetUrl, {
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
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600
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
 * - Routes Database/Auth queries through our multi-node Anti-Block Gateways with automatic failover.
 * - Launches a hedged backup socket on the next Gateway after 2.8s if the primary socket stalls.
 * - Uses 12s per-attempt timeout so queued browser sockets never self-abort prematurely.
 */
export async function smartSupabaseFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const supabasePath = extractSupabasePath(rawUrl);

    if (!supabasePath || networkState.gateways.length === 0) {
        return window.fetch(input, init);
    }

    const method = (init.method || 'GET').toUpperCase();
    const isTokenRefresh = supabasePath.includes('/auth/v1/token') && supabasePath.includes('grant_type=refresh_token');
    const isHedgeable = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

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

                    fetchSingleAttempt(gw, supabasePath, init, 12000, ctrl1)
                        .then((res) => onSuccess(res, 1))
                        .catch(onError);

                    hedgeTimer = setTimeout(() => {
                        if (settled || init.signal?.aborted) return;
                        hedgeStarted = true;
                        pendingCount++;
                        fetchSingleAttempt(nextGw, supabasePath, init, 12000, ctrl2)
                            .then((res) => onSuccess(res, 2))
                            .catch(onError);
                    }, 2800);
                });
            } else {
                winner = await fetchSingleAttempt(gw, supabasePath, init, 12000);
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
