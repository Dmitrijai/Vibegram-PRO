import { supabase, state } from './supabase';
import { scrollToBottom, customAlert, customConfirm, customPrompt, closeModal, customToast } from './utils';
import { isSelectionMode, toggleSelectionMode, toggleMessageSelection, deleteSelectedMessages, forwardSelectedMessages, confirmForwardMultiple, selectedMessages } from './selection';
import { openLightbox, closeLightbox, lightboxNext, lightboxPrev } from './lightbox';
import { toggleReactionMenu, toggleReaction, toggleMessageMenu, toggleEmojiMenu, sendEmojiMessage, getNotoEmojiUrl, closeAllMessageMenus, adjustMenuPosition, generateReactionsHtml } from './reactions';

let touchTimer: any;
let ignoreNextClick = false;
(window as any).setIgnoreNextClick = (val: boolean) => { ignoreNextClick = val; };
let touchTarget: string | null = null;
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('click', (e) => {
    if (ignoreNextClick) {
        e.stopPropagation();
        e.preventDefault();
        ignoreNextClick = false;
    }
}, true);

(window as any).handleMessageTouchStart = (e: TouchEvent | MouseEvent, msgId: string) => {
    touchTarget = msgId;
    if (window.TouchEvent && e instanceof TouchEvent) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    } else {
        touchStartX = (e as MouseEvent).clientX;
        touchStartY = (e as MouseEvent).clientY;
    }
    touchTimer = setTimeout(() => {
        if (touchTarget === msgId) {
            ignoreNextClick = true;
            (window as any).toggleReactionMenu(e, msgId);
            if (navigator.vibrate) navigator.vibrate(50);
            touchTarget = null;
        }
    }, 500);
};

(window as any).handleMessageTouchEnd = (e: TouchEvent | MouseEvent) => {
    clearTimeout(touchTimer);
    touchTarget = null;
    if (ignoreNextClick) {
        setTimeout(() => { ignoreNextClick = false; }, 300);
    }
};

(window as any).handleMessageTouchMove = (e: TouchEvent | MouseEvent) => {
    if (!touchTarget) return;
    let currentX = 0;
    let currentY = 0;
    if (window.TouchEvent && e instanceof TouchEvent) {
        currentX = e.touches[0].clientX;
        currentY = e.touches[0].clientY;
    } else {
        currentX = (e as MouseEvent).clientX;
        currentY = (e as MouseEvent).clientY;
    }
    if (Math.abs(currentX - touchStartX) > 10 || Math.abs(currentY - touchStartY) > 10) {
        clearTimeout(touchTimer);
        touchTarget = null;
    }
};



