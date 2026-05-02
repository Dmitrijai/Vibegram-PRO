const fs = require('fs');

const lines = fs.readFileSync('src/messages.ts', 'utf-8').split('\n');

function getLines(start, end) {
    return lines.slice(start - 1, end).join('\n');
}

const imports = `import { supabase, state } from './supabase';
import { scrollToBottom, customAlert, customConfirm, customPrompt, closeModal, customToast } from './utils';
import { isSelectionMode, toggleSelectionMode, toggleMessageSelection, deleteSelectedMessages, forwardSelectedMessages, confirmForwardMultiple, selectedMessages } from './selection';
import { openLightbox, closeLightbox, lightboxNext, lightboxPrev } from './lightbox';
import { toggleReactionMenu, toggleReaction, toggleMessageMenu, toggleEmojiMenu, sendEmojiMessage, getNotoEmojiUrl, closeAllMessageMenus, adjustMenuPosition, generateReactionsHtml } from './reactions';
`;

const mediaObserver = getLines(7, 55);
const markRead = getLines(57, 105);
const renderContent = getLines(107, 131);
const scrollListener = getLines(133, 156);
const loadMsgsUntil = getLines(158, 180);
const loadMsgs = getLines(182, 206);
const renderMsgs = getLines(208, 503);
const unreadCounter = getLines(505, 534);
const broadcastTyping = getLines(536, 550);
const handleInput = getLines(552, 574);
const attachMenu = getLines(576, 582);
const downloadMedia = getLines(584, 602);
const copyMsg = getLines(604, 612);
const downloadMsgMedia = getLines(614, 699);
const mediaSelect = getLines(701, 713);
const removeMedia = getLines(715, 723);
const renderMediaModal = getLines(725, 786);
const clearMediaSel = getLines(788, 790);
const fileSelect = getLines(792, 805);
const clearFile = getLines(807, 812);
const replyToMsg = getLines(814, 833);
const cancelReply = getLines(835, 850);
const forwardMsg = getLines(852, 923);
const toggleForward = getLines(925, 946);
const confirmForward = getLines(948, 980);
const selectForward = getLines(982, 982);
const sendMsg = getLines(984, 1239);
const editMsg = getLines(1241, 1252);
const deleteMsg = getLines(1254, 1267);
const videoCircle = getLines(1269, 1349);
const videoProgress = getLines(1351, 1362);
const inlineVideo = getLines(1364, 1424);
const toggleAudio = getLines(1426, 1496);
const mediaDrag = getLines(1498, 1605);
const cancelSend = getLines(1607, 1613);
const cancelRec = getLines(1615, 1646);
const sendRec = getLines(1648, 1679);
const switchCam = getLines(1681, 1715);
const toggleRec = getLines(1717, 1900);
const touchLogic = getLines(1902, 1961);

const coreContent = imports + '\n' +
    'import { getMediaObserver, clearFile } from "./messages-media";\n' +
    'import { cancelReply } from "./messages-actions";\n' +
    'let currentMessageLimit = 50;\nlet isLoadingMore = false;\nlet hasMoreMessages = true;\nlet messageScrollListener: any = null;\nlet typingTimeout: any = null;\n' +
    markRead + '\n' + renderContent + '\n' + scrollListener + '\n' + loadMsgsUntil + '\n' + loadMsgs + '\n' + renderMsgs + '\n' + unreadCounter + '\n' + broadcastTyping + '\n' + handleInput + '\n' + sendMsg + '\n' + cancelSend + '\n';
fs.writeFileSync('src/messages-core.ts', coreContent.replace(/let currentMessageLimit = 50;\nlet isLoadingMore = false;\nlet hasMoreMessages = true;\nlet messageScrollListener: any = null;\n/g, '').replace(/let typingTimeout: any = null;\n/g, ''));

const actionsContent = imports + '\n' +
    'import { loadMessages } from "./messages-core";\n' +
    replyToMsg + '\n' + cancelReply + '\n' + forwardMsg + '\n' + toggleForward + '\n' + confirmForward + '\n' + selectForward + '\n' + editMsg + '\n' + deleteMsg + '\n' + copyMsg + '\n';
fs.writeFileSync('src/messages-actions.ts', actionsContent);

const mediaContent = imports + '\n' +
    'import { handleInput, broadcastTyping, sendMessage } from "./messages-core";\n' +
    mediaObserver + '\n' + attachMenu + '\n' + downloadMedia + '\n' + downloadMsgMedia + '\n' + mediaSelect + '\n' + removeMedia + '\n' + renderMediaModal + '\n' + clearMediaSel + '\n' + fileSelect + '\n' + clearFile + '\n' + videoCircle + '\n' + videoProgress + '\n' + inlineVideo + '\n' + toggleAudio + '\n' + mediaDrag + '\n';
fs.writeFileSync('src/messages-media.ts', mediaContent);

const recordingContent = imports + '\n' +
    'import { broadcastTyping, loadMessages } from "./messages-core";\n' +
    'import { cancelReply } from "./messages-actions";\n' +
    cancelRec + '\n' + sendRec + '\n' + switchCam + '\n' + toggleRec + '\n';
fs.writeFileSync('src/messages-recording.ts', recordingContent);

const touchContent = imports + '\n' + touchLogic + '\n';
fs.writeFileSync('src/messages-touch.ts', touchContent);

const indexContent = `export * from './messages-core';
export * from './messages-actions';
export * from './messages-media';
export * from './messages-recording';
export * from './messages-touch';
`;
fs.writeFileSync('src/messages.ts', indexContent);

console.log('Refactoring complete.');
