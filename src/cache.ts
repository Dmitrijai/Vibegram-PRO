import { rewriteLegacyStorageUrlsInJson } from './network';

const BOOTSTRAP_KEY = 'vibegram_cache_bootstrap_v1';
const CHATS_KEY = 'vibegram_cache_chats_v1';
const MSGS_PREFIX = 'vibegram_cache_msgs_v1_';
const MSGS_INDEX_KEY = 'vibegram_cache_msgs_index_v1';
const ACTIVE_CHAT_KEY = 'vibegram_active_chat_meta_v1';
const DRAFTS_KEY = 'vibegram_drafts_v1';
const SCROLL_POS_KEY = 'vibegram_scroll_pos_v1';

const MAX_LOCALSTORAGE_CHATS_MESSAGES = 25;
const MAX_LOCALSTORAGE_MESSAGES_PER_CHAT = 50;
const MAX_IDB_MESSAGES_PER_CHAT = 100;
const MAX_IDB_MEDIA_BLOBS = 160;

const IDB_NAME = 'vibegram_local_db_v1';
const IDB_VERSION = 1;
const STORE_KV = 'kv';
const STORE_MSGS = 'messages';
const STORE_MEDIA = 'media_blobs';

// In-memory mirrors for 0ms synchronous access after hydration
const memoryMessages = new Map<string, any[]>();
const memoryMediaObjectUrls = new Map<string, string>();
let memoryChats: any[] | null = null;
let memoryBootstrap: { user: any; profile: any; updatedAt: number } | null = null;
let memoryDrafts: Record<string, string> | null = null;
let memoryScrollPos: Record<string, number> | null = null;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openLocalDb(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
        return Promise.resolve(null);
    }
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
        try {
            const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_KV)) {
                    db.createObjectStore(STORE_KV);
                }
                if (!db.objectStoreNames.contains(STORE_MSGS)) {
                    db.createObjectStore(STORE_MSGS);
                }
                if (!db.objectStoreNames.contains(STORE_MEDIA)) {
                    const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'key' });
                    mediaStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });

    return dbPromise;
}

async function idbSet(storeName: string, key: string, value: any): Promise<void> {
    const db = await openLocalDb();
    if (!db) return;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        } catch {
            resolve();
        }
    });
}

async function idbGet<T = any>(storeName: string, key: string): Promise<T | null> {
    const db = await openLocalDb();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

/**
 * Hydrates IndexedDB stores into synchronous memory on startup so large message histories
 * and cached media blobs are ready immediately.
 */
export async function initPersistentCache(): Promise<void> {
    const db = await openLocalDb();
    if (!db) return;

    try {
        const tx = db.transaction([STORE_KV, STORE_MSGS], 'readonly');
        const kvStore = tx.objectStore(STORE_KV);
        const msgStore = tx.objectStore(STORE_MSGS);

        const chatsReq = kvStore.get(CHATS_KEY);
        chatsReq.onsuccess = () => {
            if (Array.isArray(chatsReq.result) && chatsReq.result.length > 0 && !memoryChats) {
                try {
                    const clean = JSON.parse(rewriteLegacyStorageUrlsInJson(JSON.stringify(chatsReq.result)));
                    memoryChats = clean;
                } catch {}
            }
        };

        // Ensure any legacy Shorts cache is purged from local storage and IndexedDB
        try {
            localStorage.removeItem('vibegram_cache_shorts_v1');
            localStorage.removeItem('vibegram_cache_v3_shorts');
        } catch {}
        try {
            const writeTx = db.transaction(STORE_KV, 'readwrite');
            writeTx.objectStore(STORE_KV).delete('vibegram_cache_shorts_v1');
        } catch {}

        const keysReq = msgStore.getAllKeys();
        keysReq.onsuccess = () => {
            const keys = keysReq.result || [];
            keys.forEach((k) => {
                const chatId = String(k);
                const r = msgStore.get(k);
                r.onsuccess = () => {
                    if (Array.isArray(r.result) && r.result.length > 0 && !memoryMessages.has(chatId)) {
                        try {
                            const clean = JSON.parse(rewriteLegacyStorageUrlsInJson(JSON.stringify(r.result)));
                            memoryMessages.set(chatId, clean);
                        } catch {}
                    }
                };
            });
        };
    } catch {}
}

// Start warming IndexedDB immediately on module load
if (typeof window !== 'undefined') {
    initPersistentCache();
}

export function normalizeMediaCacheKey(rawUrl: string): string {
    if (!rawUrl) return '';
    const idx = rawUrl.indexOf('/cloudinary/');
    if (idx !== -1) {
        return rawUrl.substring(idx).split('?')[0];
    }
    if (rawUrl.startsWith('https://res.cloudinary.com/')) {
        return '/cloudinary' + rawUrl.substring('https://res.cloudinary.com'.length).split('?')[0];
    }
    const storageIdx = rawUrl.indexOf('/storage/v1/');
    if (storageIdx !== -1) {
        return rawUrl.substring(storageIdx).split('?')[0];
    }
    return rawUrl.split('?')[0];
}

export function getSyncMediaObjectUrl(rawUrl: string): string | null {
    const key = normalizeMediaCacheKey(rawUrl);
    if (!key) return null;
    return memoryMediaObjectUrls.get(key) || memoryMediaObjectUrls.get(rawUrl) || null;
}

export async function saveMediaBlobToCache(rawUrl: string, blob: Blob): Promise<string> {
    if (!rawUrl || !blob || blob.size === 0) return rawUrl;
    const key = normalizeMediaCacheKey(rawUrl);
    let objUrl = memoryMediaObjectUrls.get(key);
    if (!objUrl) {
        objUrl = URL.createObjectURL(blob);
        memoryMediaObjectUrls.set(key, objUrl);
        memoryMediaObjectUrls.set(rawUrl, objUrl);
    }

    // Persist blobs up to 15 MB in IndexedDB so voice messages, circles, photos, and short videos survive page refresh
    if (blob.size <= 15 * 1024 * 1024) {
        const db = await openLocalDb();
        if (db) {
            try {
                const tx = db.transaction(STORE_MEDIA, 'readwrite');
                const store = tx.objectStore(STORE_MEDIA);
                store.put({
                    key,
                    blob,
                    size: blob.size,
                    type: blob.type,
                    updatedAt: Date.now()
                });

                // Evict oldest media blobs if over MAX_IDB_MEDIA_BLOBS
                const countReq = store.count();
                countReq.onsuccess = () => {
                    if (countReq.result > MAX_IDB_MEDIA_BLOBS) {
                        const idx = store.index('updatedAt');
                        const cursorReq = idx.openCursor();
                        let toDelete = countReq.result - MAX_IDB_MEDIA_BLOBS;
                        cursorReq.onsuccess = () => {
                            const cursor = cursorReq.result;
                            if (cursor && toDelete > 0) {
                                cursor.delete();
                                toDelete--;
                                cursor.continue();
                            }
                        };
                    }
                };
            } catch {}
        }
    }

    return objUrl;
}

export async function getMediaBlobFromCache(rawUrl: string): Promise<{ blob: Blob; objectUrl: string } | null> {
    if (!rawUrl) return null;
    const key = normalizeMediaCacheKey(rawUrl);
    const db = await openLocalDb();
    if (!db) return null;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE_MEDIA, 'readonly');
            const store = tx.objectStore(STORE_MEDIA);
            const req = store.get(key);
            req.onsuccess = () => {
                const rec = req.result;
                if (rec && rec.blob instanceof Blob && rec.blob.size > 0) {
                    let objectUrl = memoryMediaObjectUrls.get(key);
                    if (!objectUrl) {
                        objectUrl = URL.createObjectURL(rec.blob);
                        memoryMediaObjectUrls.set(key, objectUrl);
                        memoryMediaObjectUrls.set(rawUrl, objectUrl);
                    }
                    resolve({ blob: rec.blob, objectUrl });
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export function saveCachedBootstrap(user: any, profile: any) {
    if (!user || !profile) return;
    const payload = {
        user,
        profile,
        updatedAt: Date.now()
    };
    memoryBootstrap = payload;
    try {
        localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('Cache bootstrap save warning:', e);
    }
    idbSet(STORE_KV, BOOTSTRAP_KEY, payload);
}

export function getCachedBootstrap(): { user: any; profile: any; updatedAt: number } | null {
    if (memoryBootstrap && memoryBootstrap.user?.id && memoryBootstrap.profile?.id) {
        return memoryBootstrap;
    }
    try {
        const raw = localStorage.getItem(BOOTSTRAP_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(rewriteLegacyStorageUrlsInJson(raw));
        if (parsed && parsed.user?.id && parsed.profile?.id) {
            memoryBootstrap = parsed;
            return parsed;
        }
    } catch (e) {}
    return null;
}

export function saveCachedChats(chats: any[]) {
    if (!Array.isArray(chats)) return;
    try {
        const compactChats = chats.slice(0, 80).map((c) => {
            const msgs = Array.isArray(c.messages) ? c.messages : [];
            const unreadCount = typeof c._cachedUnreadCount === 'number' && msgs.length <= 5
                ? c._cachedUnreadCount
                : msgs.filter((m: any) => !m.is_read).length;
            const lastMsgs = msgs.slice(-5);
            return {
                ...c,
                _cachedUnreadCount: unreadCount,
                messages: lastMsgs
            };
        });
        memoryChats = compactChats;
        localStorage.setItem(CHATS_KEY, JSON.stringify(compactChats.slice(0, 50)));
        idbSet(STORE_KV, CHATS_KEY, compactChats);
    } catch (e) {
        console.warn('Cache chats save warning:', e);
    }
}

export function getCachedChats(): any[] | null {
    if (memoryChats && memoryChats.length > 0) {
        return memoryChats;
    }
    try {
        const raw = localStorage.getItem(CHATS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(rewriteLegacyStorageUrlsInJson(raw));
        if (Array.isArray(parsed) && parsed.length > 0) {
            memoryChats = parsed;
            return parsed;
        }
    } catch (e) {}
    return null;
}

export function saveCachedMessages(chatId: string, messages: any[]) {
    if (!chatId || !Array.isArray(messages)) return;
    const idbSlice = messages.slice(-MAX_IDB_MESSAGES_PER_CHAT);
    memoryMessages.set(chatId, idbSlice);
    idbSet(STORE_MSGS, chatId, idbSlice);

    try {
        const lsSlice = messages.slice(-MAX_LOCALSTORAGE_MESSAGES_PER_CHAT);
        localStorage.setItem(MSGS_PREFIX + chatId, JSON.stringify(lsSlice));

        let index: string[] = [];
        try {
            const rawIdx = localStorage.getItem(MSGS_INDEX_KEY);
            if (rawIdx) index = JSON.parse(rawIdx);
        } catch (e) {}

        index = [chatId, ...index.filter((id) => id !== chatId)];
        if (index.length > MAX_LOCALSTORAGE_CHATS_MESSAGES) {
            const evicted = index.splice(MAX_LOCALSTORAGE_CHATS_MESSAGES);
            evicted.forEach((oldId) => {
                try {
                    localStorage.removeItem(MSGS_PREFIX + oldId);
                } catch (e) {}
            });
        }
        localStorage.setItem(MSGS_INDEX_KEY, JSON.stringify(index));
    } catch (e) {
        // QuotaExceededError in localStorage is gracefully handled since IndexedDB stores full history
    }
}

export function getCachedMessages(chatId: string): any[] | null {
    if (!chatId) return null;
    const fromMem = memoryMessages.get(chatId);
    if (fromMem && fromMem.length > 0) {
        return fromMem;
    }
    try {
        const raw = localStorage.getItem(MSGS_PREFIX + chatId);
        if (!raw) return null;
        const parsed = JSON.parse(rewriteLegacyStorageUrlsInJson(raw));
        if (Array.isArray(parsed) && parsed.length > 0) {
            memoryMessages.set(chatId, parsed);
            return parsed;
        }
    } catch (e) {}
    return null;
}

export async function getCachedMessagesAsync(chatId: string): Promise<any[] | null> {
    const sync = getCachedMessages(chatId);
    if (sync && sync.length > 0) return sync;
    const fromIdb = await idbGet<any[]>(STORE_MSGS, chatId);
    if (Array.isArray(fromIdb) && fromIdb.length > 0) {
        try {
            const clean = JSON.parse(rewriteLegacyStorageUrlsInJson(JSON.stringify(fromIdb)));
            memoryMessages.set(chatId, clean);
            return clean;
        } catch {}
    }
    return null;
}

export interface ActiveChatMeta {
    chatId: string;
    otherUser: any;
    chatType: 'direct' | 'group' | 'channel';
    chatDetails: any;
    updatedAt: number;
}

export function saveActiveChatMeta(meta: Omit<ActiveChatMeta, 'updatedAt'>) {
    if (!meta || !meta.chatId) return;
    try {
        const payload: ActiveChatMeta = {
            ...meta,
            updatedAt: Date.now()
        };
        localStorage.setItem(ACTIVE_CHAT_KEY, JSON.stringify(payload));
        idbSet(STORE_KV, ACTIVE_CHAT_KEY, payload);
    } catch {}
}

export function clearActiveChatMeta() {
    try {
        localStorage.removeItem(ACTIVE_CHAT_KEY);
        idbSet(STORE_KV, ACTIVE_CHAT_KEY, null);
    } catch {}
}

export function getCachedActiveChatMeta(): ActiveChatMeta | null {
    try {
        const raw = localStorage.getItem(ACTIVE_CHAT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(rewriteLegacyStorageUrlsInJson(raw));
        if (parsed && parsed.chatId) {
            return parsed;
        }
    } catch {}
    return null;
}

export function saveDraft(chatId: string, text: string) {
    if (!chatId) return;
    if (!memoryDrafts) {
        try {
            memoryDrafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
        } catch {
            memoryDrafts = {};
        }
    }
    if (!text || !text.trim()) {
        delete memoryDrafts![chatId];
    } else {
        memoryDrafts![chatId] = text;
    }
    try {
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(memoryDrafts));
    } catch {}
}

export function getDraft(chatId: string): string {
    if (!chatId) return '';
    if (!memoryDrafts) {
        try {
            memoryDrafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
        } catch {
            memoryDrafts = {};
        }
    }
    return memoryDrafts?.[chatId] || '';
}

export function saveScrollPosition(chatId: string, scrollTop: number) {
    if (!chatId) return;
    if (!memoryScrollPos) {
        try {
            memoryScrollPos = JSON.parse(localStorage.getItem(SCROLL_POS_KEY) || '{}');
        } catch {
            memoryScrollPos = {};
        }
    }
    memoryScrollPos![chatId] = Math.max(0, Math.round(scrollTop));
    try {
        localStorage.setItem(SCROLL_POS_KEY, JSON.stringify(memoryScrollPos));
    } catch {}
}

export function getScrollPosition(chatId: string): number | null {
    if (!chatId) return null;
    if (!memoryScrollPos) {
        try {
            memoryScrollPos = JSON.parse(localStorage.getItem(SCROLL_POS_KEY) || '{}');
        } catch {
            memoryScrollPos = {};
        }
    }
    const val = memoryScrollPos?.[chatId];
    return typeof val === 'number' ? val : null;
}

export function clearAllVibegramCache() {
    memoryMessages.clear();
    memoryChats = null;
    memoryBootstrap = null;
    memoryDrafts = null;
    memoryScrollPos = null;
    try {
        localStorage.removeItem(BOOTSTRAP_KEY);
        localStorage.removeItem(CHATS_KEY);
        localStorage.removeItem(ACTIVE_CHAT_KEY);
        localStorage.removeItem(DRAFTS_KEY);
        localStorage.removeItem(SCROLL_POS_KEY);
        localStorage.removeItem('vibegram_cache_shorts_v1');
        const rawIdx = localStorage.getItem(MSGS_INDEX_KEY);
        if (rawIdx) {
            const index: string[] = JSON.parse(rawIdx);
            index.forEach((id) => localStorage.removeItem(MSGS_PREFIX + id));
        }
        localStorage.removeItem(MSGS_INDEX_KEY);
    } catch (e) {}
    try {
        if (typeof window !== 'undefined' && 'indexedDB' in window) {
            window.indexedDB.deleteDatabase(IDB_NAME);
        }
    } catch {}
}
