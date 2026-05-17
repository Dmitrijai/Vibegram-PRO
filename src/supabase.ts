import { createClient } from '@supabase/supabase-js';

// Используем переменные окружения, если они установлены, иначе падаем с ошибкой, чтобы было понятно
const rawSupabaseUrl = process.env.SUPABASE_URL || (import.meta as any).env?.VITE_SUPABASE_URL || '';
const SUPABASE_URL = rawSupabaseUrl.replace(/\/rest\/v[0-9]+\/?$/, '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Ключи Supabase не настроены. Добавьте SUPABASE_URL и SUPABASE_ANON_KEY в AI Studio Secrets.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
    activeChatParentInfo: null as { parentId: string, parentName: string } | null,
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
    isTechSupportChat: false
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