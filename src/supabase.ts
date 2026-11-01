import { createClient } from '@supabase/supabase-js';
import {
    initNetworkManager,
    smartSupabaseFetch,
    PRIMARY_WORKER_URL,
    isDeadGatewayUrl,
    networkState,
    EdgeVirtualWebSocket
} from './network';

function deobfuscate(val: string | undefined): string {
    if (!val) return '';
    try {
        return atob(val.split('').reverse().join(''));
    } catch (e) {
        return '';
    }
}

// Default obfuscated public anon token fallback ONLY if CI secret is empty
const FALLBACK_ANON_OBF = '==AUHxGXhAuL4cbhQZ06wXLhXrSTC9qmXu8bxYHx_Dnkuh.06N4923902:cxe,6828177771:tai,"nona":elor,"xcghifjzgqzqslfyoxd":fer,"esabapus":ssi{=9JCVXQiOiJ1c2MiOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

const rawSupabaseUrl =
    deobfuscate(process.env.SUPABASE_URL_OBFUSCATED) ||
    process.env.SUPABASE_URL ||
    (import.meta as any).env?.VITE_SUPABASE_URL ||
    PRIMARY_WORKER_URL;

const cleanedEnvUrl = rawSupabaseUrl.replace(/\/rest\/v[0-9]+\/?$/, '').replace(/\/$/, '');
const SUPABASE_URL = !isDeadGatewayUrl(cleanedEnvUrl) ? cleanedEnvUrl : PRIMARY_WORKER_URL;

const SUPABASE_KEY =
    deobfuscate(process.env.SUPABASE_ANON_KEY_OBFUSCATED) ||
    process.env.SUPABASE_ANON_KEY ||
    (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
    '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Ключи Supabase не настроены. Добавьте SUPABASE_URL и SUPABASE_ANON_KEY в GitHub Secrets.');
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
    realtime: {
        transport: EdgeVirtualWebSocket as any
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
    }
}