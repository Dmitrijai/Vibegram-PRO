import { createClient } from '@supabase/supabase-js';

function cleanUrl(u: string) {
    return u.replace(/\/rest\/v[0-9]+\/?$/, '').replace(/\/$/, '');
}

const PRIMARY_URL = cleanUrl(process.env.SUPABASE_URL || (import.meta as any).env?.VITE_SUPABASE_URL || '');
const BACKUP_URL = cleanUrl(process.env.SUPABASE_BACKUP_URL || (import.meta as any).env?.VITE_SUPABASE_BACKUP_URL || '');
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

function getActiveSupabaseUrl(): string {
    const useBackup = localStorage.getItem('vg_active_proxy') === 'backup';
    if (useBackup && BACKUP_URL) return BACKUP_URL;
    return PRIMARY_URL;
}

// Вызывается, когда основной (или запасной) прокси перестал отвечать.
// Один раз за сессию переключает домен и перезагружает страницу.
export function tryBackupProxy(): boolean {
    if (!BACKUP_URL) return false; // запасной домен ещё не настроен
    if (sessionStorage.getItem('vg_proxy_switch_attempted')) return false; // уже пробовали в этой сессии
    sessionStorage.setItem('vg_proxy_switch_attempted', '1');
    const current = localStorage.getItem('vg_active_proxy');
    localStorage.setItem('vg_active_proxy', current === 'backup' ? 'primary' : 'backup');
    location.reload();
    return true;
}

const SUPABASE_URL = getActiveSupabaseUrl();

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Ключи Supabase не настроены. Добавьте SUPABASE_URL и SUPABASE_ANON_KEY в AI Studio Secrets.');
}

function fetchWithTimeout(url: RequestInfo | URL, options: RequestInit = {}) {
    const timeoutSignal = AbortSignal.timeout(10000);
    const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;
    return fetch(url, { ...options, signal });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        flowType: 'implicit'
    },
    global: {
        fetch: fetchWithTimeout
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
    if (state.globalChannel) {
        state.globalChannel.send({
            type: 'broadcast',
            event: 'update_trigger',
            payload: { chatId, type, senderId: state.currentUser?.id }
        }).catch(console.error);
    }
}