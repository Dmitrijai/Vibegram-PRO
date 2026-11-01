import { rewriteLegacyStorageUrlsInJson } from './network';

const BOOTSTRAP_KEY = 'vibegram_cache_bootstrap_v1';
const CHATS_KEY = 'vibegram_cache_chats_v1';
const MSGS_PREFIX = 'vibegram_cache_msgs_v1_';
const MSGS_INDEX_KEY = 'vibegram_cache_msgs_index_v1';
const MAX_CACHED_CHATS_MESSAGES = 15;
const MAX_MESSAGES_PER_CHAT = 40;

export function saveCachedBootstrap(user: any, profile: any) {
    if (!user || !profile) return;
    try {
        localStorage.setItem(
            BOOTSTRAP_KEY,
            JSON.stringify({
                user,
                profile,
                updatedAt: Date.now()
            })
        );
    } catch (e) {
        console.warn('Cache bootstrap save warning:', e);
    }
}

export function getCachedBootstrap(): { user: any; profile: any; updatedAt: number } | null {
    try {
        const raw = localStorage.getItem(BOOTSTRAP_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(rewriteLegacyStorageUrlsInJson(raw));
        if (parsed && parsed.user?.id && parsed.profile?.id) {
            return parsed;
        }
    } catch (e) {}
    return null;
}

export function saveCachedChats(chats: any[]) {
    if (!Array.isArray(chats)) return;
    try {
        const compactChats = chats.slice(0, 60).map((c) => {
            const msgs = Array.isArray(c.messages) ? c.messages : [];
            const unreadCount = msgs.filter((m: any) => !m.is_read).length;
            const lastMsgs = msgs.slice(-3);
            return {
                ...c,
                _cachedUnreadCount: unreadCount,
                messages: lastMsgs
            };
        });
        localStorage.setItem(CHATS_KEY, JSON.stringify(compactChats));
    } catch (e) {
        console.warn('Cache chats save warning:', e);
    }
}

export function getCachedChats(): any[] | null {
    try {
        const raw = localStorage.getItem(CHATS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(rewriteLegacyStorageUrlsInJson(raw));
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
    } catch (e) {}
    return null;
}

export function saveCachedMessages(chatId: string, messages: any[]) {
    if (!chatId || !Array.isArray(messages)) return;
    try {
        const slice = messages.slice(-MAX_MESSAGES_PER_CHAT);
        localStorage.setItem(MSGS_PREFIX + chatId, JSON.stringify(slice));

        let index: string[] = [];
        try {
            const rawIdx = localStorage.getItem(MSGS_INDEX_KEY);
            if (rawIdx) index = JSON.parse(rawIdx);
        } catch (e) {}

        index = [chatId, ...index.filter((id) => id !== chatId)];
        if (index.length > MAX_CACHED_CHATS_MESSAGES) {
            const evicted = index.splice(MAX_CACHED_CHATS_MESSAGES);
            evicted.forEach((oldId) => {
                try {
                    localStorage.removeItem(MSGS_PREFIX + oldId);
                } catch (e) {}
            });
        }
        localStorage.setItem(MSGS_INDEX_KEY, JSON.stringify(index));
    } catch (e) {
        console.warn('Cache messages save warning:', e);
    }
}

export function getCachedMessages(chatId: string): any[] | null {
    if (!chatId) return null;
    try {
        const raw = localStorage.getItem(MSGS_PREFIX + chatId);
        if (!raw) return null;
        const parsed = JSON.parse(rewriteLegacyStorageUrlsInJson(raw));
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
    } catch (e) {}
    return null;
}

export function clearAllVibegramCache() {
    try {
        localStorage.removeItem(BOOTSTRAP_KEY);
        localStorage.removeItem(CHATS_KEY);
        const rawIdx = localStorage.getItem(MSGS_INDEX_KEY);
        if (rawIdx) {
            const index: string[] = JSON.parse(rawIdx);
            index.forEach((id) => localStorage.removeItem(MSGS_PREFIX + id));
        }
        localStorage.removeItem(MSGS_INDEX_KEY);
    } catch (e) {}
}
