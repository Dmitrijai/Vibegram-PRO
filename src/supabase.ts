import { createClient } from '@supabase/supabase-js';
import { initNetworkManager, smartSupabaseFetch, PRIMARY_WORKER_URL, isDeadGatewayUrl, networkState } from './network';

// Всегда используем рабочий не-Cloudflare AWS Edge шлюз по умолчанию, даже если в старых секретах остался supabase.co / onrender.com / qzz.io
const rawSupabaseUrl = process.env.SUPABASE_URL || (import.meta as any).env?.VITE_SUPABASE_URL || PRIMARY_WORKER_URL;
const cleanedEnvUrl = rawSupabaseUrl.replace(/\/rest\/v[0-9]+\/?$/, '').replace(/\/$/, '');
const isLegacyBlockedOrDead =
    isDeadGatewayUrl(cleanedEnvUrl) ||
    cleanedEnvUrl.includes('supabase.co') ||
    cleanedEnvUrl.includes('vibegram.qzz.io');
const SUPABASE_URL = !isLegacyBlockedOrDead ? cleanedEnvUrl : PRIMARY_WORKER_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Ключи Supabase не настроены. Добавьте SUPABASE_URL и SUPABASE_ANON_KEY в AI Studio Secrets.');
}

// Migrate legacy auth token key if present so switching gateways never logs out existing users
try {
    const unifiedKey = 'sb-vibegram-auth-token';
    if (!localStorage.getItem(unifiedKey)) {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('sb-') && k.endsWith('-auth-token') && k !== unifiedKey) {
                const val = localStorage.getItem(k);
                if (val) {
                    localStorage.setItem(unifiedKey, val);
                    break;
                }
            }
        }
    }
} catch (e) {}

initNetworkManager(SUPABASE_URL, SUPABASE_KEY);

// Lock-free queue per auth key to prevent navigator.locks 5000ms steal AbortError on slow mobile DPI connections
const authLocks = new Map<string, Promise<any>>();
async function safeAuthLock<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
    const prev = authLocks.get(name) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => fn());
    authLocks.set(name, next);
    try {
        return await next;
    } finally {
        if (authLocks.get(name) === next) {
            authLocks.delete(name);
        }
    }
}

export const supabase = createClient(SUPABASE_URL || PRIMARY_WORKER_URL, SUPABASE_KEY, {
    auth: {
        flowType: 'implicit',
        storageKey: 'sb-vibegram-auth-token',
        lock: safeAuthLock
    },
    global: {
        fetch: smartSupabaseFetch
    }
});

// Глобальное состояние приложения
export const state = {
    pendingLockType: null as string | null,
    pendingLockValue: null as string | null,
    currentUser: null as any,
    currentProfile: null as any,
    activeChatId: null as string | null,
    activeChatType: 'private' as 'direct' | 'private' | 'group' | 'channel',
    activeChatIsGroup: false,
    activeChatIsPublic: false,
    activeChatAvatarUrl: null as string | null,
    activeChatParentInfo: null as { parentId: string, parentName: string, messageId?: string } | null,
    activeChatOtherUser: null as any,
    activeChatMembers: [] as any[],
    activeChatDescription: null as string | null | undefined,
    selectedFiles: [] as File[],
    groupCreationSelectedUsers: [] as any[],
    isRecordingVoice: false,
    isRecordingVideo: false,
    mediaRecorder: null as MediaRecorder | null,
    mediaChunks: [] as any[],
    localStream: null as MediaStream | null,
    replyingTo: null as any,
    forwardingMsg: null as any,
    forwardSelectedChats: [] as string[],
    chatChannel: null as any,
    typingUsers: new Map<string, { action: string, timer: any, userName?: string }>(),
    audioPlayers: new Map<string, HTMLAudioElement>(),
    recordingInterval: null as any,
    mediaStream: null as MediaStream | null,
    chatScrollPositions: new Map<string, any>(),
    globalChannel: null as any,
    isAdminStatus: false,
    isTechSupportChat: false,
    shareSelectedChats: [] as string[],
    pendingShareData: null as any
};

export function broadcastUpdate(chatId: string, type: string = 'message') {
    if (state.globalChannel && networkState.realtimeConnected) {
        state.globalChannel.send({
            type: 'broadcast',
            event: 'update_trigger',
            payload: { chatId, type, senderId: state.currentUser?.id }
        }).catch(() => {});
    } else if (state.globalChannel && typeof state.globalChannel.httpSend === 'function') {
        state.globalChannel.httpSend('update_trigger', {
            chatId,
            type,
            senderId: state.currentUser?.id
        }).catch(() => {});
    }
}