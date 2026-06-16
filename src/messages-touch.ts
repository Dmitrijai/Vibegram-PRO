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

let isSwiping = false;
let swipeDeltaX = 0;

(window as any).handleMessageTouchStart = (e: TouchEvent | MouseEvent, msgId: string) => {
    touchTarget = msgId;
    isSwiping = false;
    swipeDeltaX = 0;
    if (window.TouchEvent && e instanceof TouchEvent) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    } else {
        touchStartX = (e as MouseEvent).clientX;
        touchStartY = (e as MouseEvent).clientY;
    }
    touchTimer = setTimeout(() => {
        if (touchTarget === msgId && !isSwiping) {
            ignoreNextClick = true;
            (window as any).toggleReactionMenu(e, msgId);
            if (navigator.vibrate) {
                try { navigator.vibrate(50); } catch(e){}
            }
            touchTarget = null;
        }
    }, 500);
};

(window as any).handleMessageTouchMove = (e: TouchEvent | MouseEvent) => {
    if (!touchTarget && !isSwiping) return;
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
    }
    
    // Check horizontal swipe if touchTarget exists
    if (touchTarget && Math.abs(currentX - touchStartX) > Math.abs(currentY - touchStartY) && Math.abs(currentX - touchStartX) > 10) {
        isSwiping = true;
    }
    
    if (isSwiping && window.TouchEvent && e instanceof TouchEvent) {
        swipeDeltaX = currentX - touchStartX;
        
        // Swipe left only
        if (swipeDeltaX < 0 && swipeDeltaX > -70) {
            const el = document.getElementById(`msg-${touchTarget || ''}`);
            if (el) {
                el.style.transform = `translateX(${swipeDeltaX}px)`;
            }
            // Prevent default scroll behavior
            if (e.cancelable) e.preventDefault();
        }
    }
};

(window as any).handleMessageTouchEnd = (e: TouchEvent | MouseEvent) => {
    clearTimeout(touchTimer);
    
    if (isSwiping && swipeDeltaX < -40) {
        const el = document.getElementById(`msg-${touchTarget || ''}`);
        if (el) {
             const replyParamsStr = el.dataset.replyParams;
             if (replyParamsStr) {
                 try {
                     const [id, content, sender] = JSON.parse(replyParamsStr);
                     import('./messages-actions').then(m => m.replyToMessage(id, decodeURIComponent(content), sender));
                     if (navigator.vibrate) try { navigator.vibrate(50); } catch(e){}
                 } catch(err) {
                     console.error("Failed to parse reply params", err);
                 }
             }
        }
    }
    
    if (isSwiping) {
        const currentTarget = touchTarget;
        const el = document.getElementById(`msg-${currentTarget || ''}`);
        if (el) {
             el.style.transition = 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)';
             el.style.transform = 'translateX(0)';
             setTimeout(() => { if (el) el.style.transition = ''; }, 200);
        }
        setTimeout(() => { isSwiping = false; }, 50);
    }
    
    touchTarget = null;
    swipeDeltaX = 0;
    
    if (ignoreNextClick) {
        setTimeout(() => { ignoreNextClick = false; }, 300);
    }
};



