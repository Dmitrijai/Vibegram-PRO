import './index.css';
import { supabase, state } from './supabase';
import * as logic from './logic';
import './ai';
import './shorts'; // Add Shorts support
import { setupMiniApps, runStandaloneMiniApp } from './miniapps';

window.addEventListener('popstate', (e) => {
    const hash = window.location.hash;
    
    // Fallbacks / globals for navigation
    if (!hash || hash === '' || hash === '#') {
        // Back to home (chat list on mobile, or just base state)
        if (state.activeChatId && window.innerWidth < 768) {
            logic.closeChatMobile(true);
        }
        logic.closeModal(undefined, true); // Hide settings or info modals
    } else if (hash === '#chat') {
        // We are on chat view, but maybe a modal was open
        logic.closeModal(undefined, true);
        if (window.innerWidth < 768) {
             const chatArea = document.getElementById('chat-area');
             const sidebar = document.getElementById('sidebar');
             if (chatArea) chatArea.classList.remove('hidden');
             if (sidebar) sidebar.classList.add('hidden');
        }
    } else if (hash === '#settings') {
        logic.openSettings('full', true);
    } else if (hash === '#info') {
        if (logic.state.activeChatId) {
            logic.openChatInfo(true);
        } else {
            logic.closeModal(undefined, true);
        }
    } else if (hash === '#create' || hash === '#create-channel' || hash === '#create-group') {
		// Handled gracefully elsewhere or fallback
	} else {
		logic.closeModal(undefined, true);
	}
});

// Attach functions to window for HTML event handlers
(window as any).logic = logic;
(window as any).loginWithGoogle = logic.loginWithGoogle;
(window as any).logout = logic.logout;
(window as any).forceLogout = logic.forceLogout;
(window as any).deleteAccount = logic.deleteAccount;
(window as any).searchUsers = logic.searchUsers;
(window as any).startChatWithUser = logic.startChatWithUser;
(window as any).startDirectChatById = logic.startDirectChatById;
(window as any).openSavedMessages = () => logic.startDirectChatById(state.currentUser!.id);
(window as any).joinGroup = logic.joinGroup;
(window as any).closeModal = logic.closeModal;
(window as any).openSettings = logic.openSettings;
(window as any).saveSettings = logic.saveSettings;
(window as any).saveAppLock = logic.saveAppLock;
(window as any).promptForPasswordSetting = logic.promptForPasswordSetting;
(window as any).verifyLockPasscode = logic.verifyLockPasscode;
(window as any).uploadAvatar = logic.uploadAvatar;
(window as any).toggleMuteChat = logic.toggleMuteChat;
(window as any).openChatInfo = logic.openChatInfo;
(window as any).cancelSend = logic.cancelSend;
(window as any).openCreateGroup = logic.openCreateGroup;
(window as any).openCreateChannel = logic.openCreateChannel;
(window as any).searchGroupUsers = logic.searchGroupUsers;
(window as any).removeGroupUser = logic.removeGroupUser;
(window as any).createGroup = logic.createGroup;
(window as any).createChannel = logic.createChannel;
(window as any).leaveGroup = logic.leaveGroup;
(window as any).clearHistory = logic.clearHistory;
(window as any).deleteChat = logic.deleteChat;
(window as any).toggleMuteChatById = logic.toggleMuteChatById;
(window as any).deleteChatById = logic.deleteChatById;
(window as any).uploadGroupAvatar = logic.uploadGroupAvatar;
(window as any).saveGroupSettings = logic.saveGroupSettings;
(window as any).generateInviteKey = logic.generateInviteKey;
(window as any).switchChatInfoTab = logic.switchChatInfoTab;
(window as any).jumpToMessage = logic.jumpToMessage;
(window as any).joinChannelWithKey = logic.joinChannelWithKey;
(window as any).promoteToAdmin = logic.promoteToAdmin;
(window as any).demoteAdmin = logic.demoteAdmin;
(window as any).kickMember = logic.kickMember;
(window as any).approveJoinRequest = logic.approveJoinRequest;
(window as any).rejectJoinRequest = logic.rejectJoinRequest;
(window as any).openAddMemberModal = logic.openAddMemberModal;
(window as any).searchUsersForAdding = logic.searchUsersForAdding;
(window as any).selectUserForAdding = logic.selectUserForAdding;
(window as any).removeUserFromAdding = logic.removeUserFromAdding;
(window as any).addSelectedMembers = logic.addSelectedMembers;
(window as any).closeChatMobile = logic.closeChatMobile;
(window as any).handleInput = logic.handleInput;
(window as any).handleFileSelect = logic.handleFileSelect;
(window as any).handleMediaSelect = logic.handleMediaSelect;
(window as any).toggleAttachMenu = logic.toggleAttachMenu;
(window as any).clearFile = logic.clearFile;
(window as any).sendMessage = logic.sendMessage;
(window as any).deleteMessage = logic.deleteMessage;
(window as any).editMessage = logic.editMessage;
(window as any).replyToMessage = logic.replyToMessage;
(window as any).cancelReply = logic.cancelReply;
(window as any).openCreatePollModal = logic.openCreatePollModal;
(window as any).closeCreatePollModal = logic.closeCreatePollModal;
(window as any).addPollOption = logic.addPollOption;
(window as any).createPoll = logic.createPoll;
(window as any).votePoll = logic.votePoll;
(window as any).showPollVoters = logic.showPollVoters;
(window as any).closePollVotersModal = logic.closePollVotersModal;
(window as any).transcribeMedia = logic.transcribeMedia;
(window as any).forwardMessage = logic.forwardMessage;
(window as any).toggleForwardChatSelection = logic.toggleForwardChatSelection;
(window as any).confirmForward = logic.confirmForward;
(window as any).handleVideoCircleClick = logic.handleVideoCircleClick;
(window as any).updateVideoProgress = logic.updateVideoProgress;
(window as any).toggleAudio = logic.toggleAudio;
(window as any).toggleInlineVideo = logic.toggleInlineVideo;
(window as any).pauseAllMedia = logic.pauseAllMedia;
(window as any).toggleMessageMenu = logic.toggleMessageMenu;
(window as any).toggleReactionMenu = logic.toggleReactionMenu;
(window as any).toggleReaction = logic.toggleReaction;
(window as any).closeAllMessageMenus = logic.closeAllMessageMenus;
(window as any).toggleEmojiMenu = logic.toggleEmojiMenu;
(window as any).sendEmojiMessage = logic.sendEmojiMessage;
(window as any).toggleRecording = logic.toggleRecording;
(window as any).cancelRecording = logic.cancelRecording;
(window as any).sendRecording = logic.sendRecording;
(window as any).switchCamera = logic.switchCamera;
(window as any).removeSelectedMedia = logic.removeSelectedMedia;
(window as any).clearMediaSelection = logic.clearMediaSelection;
(window as any).openLightbox = logic.openLightbox;
(window as any).closeLightbox = logic.closeLightbox;
(window as any).lightboxNext = logic.lightboxNext;
(window as any).lightboxPrev = logic.lightboxPrev;
(window as any).startVideoCall = logic.startVideoCall;
(window as any).startAudioCall = logic.startAudioCall;
(window as any).endVideoCall = logic.endVideoCall;
(window as any).toggleCallAudio = logic.toggleCallAudio;
(window as any).toggleCallVideo = logic.toggleCallVideo;

(window as any).customAlert = logic.customAlert;
(window as any).customConfirm = logic.customConfirm;
(window as any).customPrompt = logic.customPrompt;
(window as any).customToast = logic.customToast;

(window as any).toggleSelectionMode = logic.toggleSelectionMode;
(window as any).toggleMessageSelection = logic.toggleMessageSelection;
(window as any).deleteSelectedMessages = logic.deleteSelectedMessages;
(window as any).forwardSelectedMessages = logic.forwardSelectedMessages;
(window as any).startMediaLongPress = logic.startMediaLongPress;
(window as any).cancelMediaLongPress = logic.cancelMediaLongPress;
(window as any).closeMediaContextMenu = logic.closeMediaContextMenu;
(window as any).downloadMedia = logic.downloadMedia;
(window as any).toggleCirclePlay = logic.toggleCirclePlay;
(window as any).toggleMediaSelectionMode = logic.toggleMediaSelectionMode;
(window as any).toggleMediaSelection = logic.toggleMediaSelection;
(window as any).forwardSelectedMedia = logic.forwardSelectedMedia;
(window as any).deleteSelectedMedia = logic.deleteSelectedMedia;
(window as any).copyMessageText = logic.copyMessageText;
(window as any).switchCallCamera = logic.switchCallCamera;
(window as any).startRecovery = logic.startRecovery;
(window as any).verifyRecoveryCode = logic.verifyRecoveryCode;
(window as any).resendRecoveryCode = logic.resendRecoveryCode;
(window as any).openTechSupportPanel = () => {
    import('./supabase').then(({state}) => {
        if (state.isAdminStatus || (window as any).originalAdminUser) return;
        import('./admin').then(m => m.openAdminDashboard(false));
    });
};

const urlParams = new URLSearchParams(window.location.search);
const standaloneMiniAppId = urlParams.get('miniapp');
let isStandaloneMiniAppMode = false;

if (standaloneMiniAppId) {
    isStandaloneMiniAppMode = true;
    runStandaloneMiniApp(standaloneMiniAppId);
}

// Initialize app
supabase.auth.getSession().then(({ data: { session } }) => {
    if (isStandaloneMiniAppMode) return;
    if (!session) {
        const loader = document.getElementById('initial-loader');
        if (loader) {
            loader.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => loader.remove(), 300);
        }
        document.getElementById('auth-screen')!.classList.remove('hidden');
    }
});

supabase.auth.onAuthStateChange((event, session) => {
    if (isStandaloneMiniAppMode) return;
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session?.user) {
            logic.checkUser(event);
            setupRealtime();
        } else if (event === 'INITIAL_SESSION') {
            document.getElementById('auth-screen')!.classList.remove('hidden');
            const loader = document.getElementById('initial-loader');
            if (loader) {
                loader.classList.add('opacity-0', 'pointer-events-none');
                setTimeout(() => loader.remove(), 300);
            }
        }
    } else if (event === 'SIGNED_OUT') {
        document.getElementById('auth-screen')!.classList.remove('hidden');
        document.getElementById('app-screen')!.classList.add('hidden');
        subscriptionsSetup = false;
    }
});

// Setup Realtime subscriptions
let subscriptionsSetup = false;

function setupRealtime() {
    if (subscriptionsSetup || !state.currentUser) return;
    subscriptionsSetup = true;

    supabase.channel('public:messages')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async payload => {
            if (payload.eventType === 'INSERT') {
                if (payload.new.chat_id === state.activeChatId) {
                    if ((window as any).logic?.loadMessages) {
                        (window as any).logic.loadMessages(state.activeChatId);
                    }
                    if (payload.new.sender_id !== state.currentUser?.id) {
                        const list = document.getElementById('messages-list');
                        if (list && list.scrollHeight - list.scrollTop - list.clientHeight < 100) {
                            if ((window as any).logic?.markMessagesAsRead) {
                                (window as any).logic.markMessagesAsRead(state.activeChatId);
                            }
                        }
                        
                        const { data: profile } = await supabase.from('profiles').select('settings').eq('id', state.currentUser.id).single();
                        const settings = profile?.settings || {};
                        const mutedChats = settings.muted_chats || [];
                        
                        if (!mutedChats.includes(payload.new.chat_id) && settings.notifications !== false) {
                            if ((window as any).logic?.playNotificationSound) (window as any).logic.playNotificationSound();
                        }
                        
                        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
                            const { data: sender } = await supabase.from('profiles').select('display_name, username').eq('id', payload.new.sender_id).single();
                            const senderName = sender?.display_name || sender?.username || 'Пользователь';
                            const text = payload.new.content || (payload.new.message_type === 'voice' ? '🎤 Голосовое сообщение' : 'Медиа сообщение');
                            new Notification(`Новое сообщение от ${senderName}`, { body: text });
                        }
                    }
                } else {
                    if (payload.new.sender_id !== state.currentUser?.id) {
                        const { data: profile } = await supabase.from('profiles').select('settings').eq('id', state.currentUser.id).single();
                        const settings = profile?.settings || {};
                        const mutedChats = settings.muted_chats || [];
                        if (!mutedChats.includes(payload.new.chat_id) && settings.notifications !== false) {
                            const { data: sender } = await supabase.from('profiles').select('display_name, username, avatar_url').eq('id', payload.new.sender_id).single();
                            const senderName = sender?.display_name || sender?.username || 'Пользователь';
                            const text = payload.new.content || (payload.new.message_type === 'voice' ? '🎤 Голосовое сообщение' : 'Медиа сообщение');
                            
                            if ((window as any).logic?.playNotificationSound) (window as any).logic.playNotificationSound();
                            
                            if (document.hidden && "Notification" in window && Notification.permission === "granted") {
                                new Notification(`Новое сообщение от ${senderName}`, { body: text });
                            }
                            
                            if (!document.hidden && state.activeChatId !== payload.new.chat_id) {
                                if ((window as any).logic?.showInAppNotification) {
                                    (window as any).logic.showInAppNotification(payload.new.chat_id, senderName, text, sender?.avatar_url || null);
                                }
                            }
                        }
                    }
                }
            } else if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
                const chatId = payload.eventType === 'DELETE' ? payload.old.chat_id : payload.new.chat_id;
                if (state.activeChatId && chatId === state.activeChatId) {
                    if ((window as any).logic?.loadMessages) {
                         (window as any).logic.loadMessages(state.activeChatId);
                    }
                }
            }
            
            if ((window as any).logic?.loadChats) {
                 (window as any).logic.loadChats();
            }
        })
        .subscribe();

    supabase.channel('public:profiles')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, payload => {
            if (state.activeChatOtherUser && payload.new.id === state.activeChatOtherUser.id) {
                state.activeChatOtherUser = payload.new;
                const statusEl = document.getElementById('current-chat-status')!;
                const status = (window as any).logic?.getStatusText ? (window as any).logic.getStatusText(payload.new.is_online, payload.new.last_seen) : '';
                statusEl.innerText = status;
                statusEl.className = `text-xs font-medium ${status === 'в сети' ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`;
                
                const avatar = document.getElementById('chat-header-avatar')!;
                if (payload.new.avatar_url) {
                    avatar.innerHTML = `<img src="${payload.new.avatar_url}" class="w-full h-full object-cover rounded-full">`;
                    avatar.className = `w-10 h-10 mr-3 shadow-sm relative rounded-full`;
                } else {
                    const firstLetter = (payload.new.display_name || payload.new.username || 'U')[0].toUpperCase();
                    avatar.innerText = firstLetter;
                    avatar.className = `w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold mr-3 shadow-sm relative`;
                }
            }
            if (payload.new.id === state.currentUser?.id) {
                state.currentProfile = payload.new;
                const balDisplay = document.getElementById('my-vib-balance-display');
                if (balDisplay) {
                    balDisplay.innerText = String(payload.new.vib_balance || 0);
                }
            }
            if (state.activeChatId && ((payload.new.id === state.activeChatOtherUser?.id) || (payload.new.id === state.currentUser?.id))) {
                if ((window as any).updateChatInputUI) {
                    (window as any).updateChatInputUI();
                }
            }
            if (state.activeChatId) {
                if ((window as any).logic?.loadMessages) (window as any).logic.loadMessages(state.activeChatId);
            }
            if ((window as any).logic?.loadChats) (window as any).logic.loadChats();
        })
        .subscribe();

    supabase.channel('public:chats')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, payload => {
            if (state.activeChatIsGroup && state.activeChatId === payload.new.id) {
                state.activeChatDescription = payload.new.description;
                const avatar = document.getElementById('chat-header-avatar')!;
                if (payload.new.avatar_url) {
                    avatar.innerHTML = `<img src="${payload.new.avatar_url}" class="w-full h-full object-cover rounded-full">`;
                    avatar.className = `w-10 h-10 mr-3 shadow-sm relative rounded-full`;
                }
            }
            if ((window as any).logic?.loadChats) (window as any).logic.loadChats();
        })
        .subscribe();

    state.globalChannel = supabase.channel('global-updates', {
        config: {
            broadcast: { ack: false }
        }
    })
        .on('broadcast', { event: 'update_trigger' }, (payload: any) => {
            const { chatId, type, senderId } = payload.payload;
            if (chatId) {
                // Short delay to ensure DB commit is visible
                setTimeout(() => {
                    if ((window as any).logic?.loadChats) {
                        (window as any).logic.loadChats();
                    }
                    if (state.activeChatId === chatId) {
                        if ((window as any).logic?.loadMessages) {
                            (window as any).logic.loadMessages(chatId);
                        }
                        if (type === 'message' && senderId !== state.currentUser?.id) {
                            const list = document.getElementById('messages-list');
                            if (list && list.scrollHeight - list.scrollTop - list.clientHeight < 100) {
                                if ((window as any).logic?.markMessagesAsRead) {
                                    (window as any).logic.markMessagesAsRead(state.activeChatId);
                                }
                            }
                        }
                    }
                }, 300);
            }
        })
        .subscribe();
}

// Setup UI event listeners
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if ((window as any).logic?.pauseAllMedia) {
                (window as any).logic.pauseAllMedia(undefined, true);
            }
        }
    });
    window.addEventListener('beforeunload', () => {
        if ((window as any).logic?.pauseAllMedia) {
            (window as any).logic.pauseAllMedia(undefined, true);
        }
        const savedIncognito = localStorage.getItem('incognito_chat_args');
        if (savedIncognito) {
            localStorage.removeItem('incognito_chat_args');
        }
    });

    document.addEventListener('click', (e) => {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
        if ((window as any).closeAllMessageMenus) {
            (window as any).closeAllMessageMenus();
        }
        const attachMenu = document.getElementById('attach-menu');
        const attachBtn = document.getElementById('attach-btn');
        if (attachMenu && !attachMenu.classList.contains('hidden')) {
            if (!attachMenu.contains(e.target as Node) && !attachBtn?.contains(e.target as Node)) {
                attachMenu.classList.add('hidden');
            }
        }
        
        const emojiMenu = document.getElementById('emoji-menu');
        const emojiBtn = document.getElementById('emoji-btn');
        if (emojiMenu && !emojiMenu.classList.contains('hidden')) {
            if (!emojiMenu.contains(e.target as Node) && !emojiBtn?.contains(e.target as Node)) {
                emojiMenu.classList.add('hidden');
            }
        }
    });

    document.getElementById('messages-list')?.addEventListener('dblclick', (e) => {
        if (logic.isSelectionMode) {
            const target = e.target as HTMLElement;
            if (!target.closest('.msg-wrapper')) {
                logic.toggleSelectionMode(false);
            }
        }
    });

    document.getElementById('messages-list')?.addEventListener('scroll', (e) => {
        if ((window as any).closeAllMessageMenus) {
            (window as any).closeAllMessageMenus();
        }
        const list = e.target as HTMLElement;
        if (list.scrollHeight - list.scrollTop - list.clientHeight < 50) {
            const counter = document.getElementById('unread-floating-counter');
            if (counter && !counter.classList.contains('hidden')) {
                counter.classList.add('hidden');
                if (state.activeChatId) {
                    logic.markMessagesAsRead(state.activeChatId);
                }
            }
        }
    });

    document.getElementById('message-input')?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const input = e.target as HTMLTextAreaElement;
            if (input.value.trimStart().startsWith('@ai ')) {
                if ((window as any).generateAiImage) {
                    (window as any).generateAiImage();
                }
            } else {
                logic.sendMessage();
            }
        }
    });

    document.getElementById('search-input')?.addEventListener('blur', () => {
        setTimeout(() => document.getElementById('search-results')?.classList.add('hidden'), 200);
    });
});

setupMiniApps();
