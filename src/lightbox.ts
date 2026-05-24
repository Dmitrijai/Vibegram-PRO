import { isSelectionMode } from './selection';

let lightboxItems: string[] = [];
let currentLightboxIndex = 0;

export function openLightbox(url: string) {
    if (isSelectionMode) {
        return; // Handled by wrapper onclick
    }
    const mediaItems = Array.from(document.querySelectorAll('.chat-media-item')) as (HTMLImageElement | HTMLVideoElement)[];
    lightboxItems = mediaItems.map(item => item.src || item.getAttribute('data-src') || '');
    currentLightboxIndex = lightboxItems.indexOf(url);
    if (currentLightboxIndex === -1) {
        lightboxItems = [url];
        currentLightboxIndex = 0;
    }
    
    renderLightbox();
    document.getElementById('lightbox-modal')?.classList.remove('hidden');
}

export function closeLightbox(e?: Event) {
    if (e) e.stopPropagation();
    document.getElementById('lightbox-modal')?.classList.add('hidden');
    const content = document.getElementById('lightbox-content');
    if (content) content.innerHTML = '';
}

export function lightboxNext(e?: Event) {
    if (e) e.stopPropagation();
    if (currentLightboxIndex < lightboxItems.length - 1) {
        currentLightboxIndex++;
        renderLightbox();
    }
}

export function lightboxPrev(e?: Event) {
    if (e) e.stopPropagation();
    if (currentLightboxIndex > 0) {
        currentLightboxIndex--;
        renderLightbox();
    }
}

function renderLightbox() {
    const content = document.getElementById('lightbox-content');
    const prevBtn = document.getElementById('lightbox-prev');
    const nextBtn = document.getElementById('lightbox-next');
    
    if (!content || !prevBtn || !nextBtn) return;
    
    const url = lightboxItems[currentLightboxIndex];
    if (!url) return;
    
    const isVideo = url.includes('.webm') || url.includes('.mp4') || url.includes('.mov') || url.includes('video');
    
    if (isVideo) {
        content.innerHTML = `<video src="${url}" class="max-w-full max-h-full object-contain rounded-lg shadow-2xl" controls autoplay onerror="this.onerror=null; window.handleMediaError(this, '${url}');"></video>`;
    } else {
        content.innerHTML = `<img src="${url}" class="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onerror="this.onerror=null; window.handleMediaError(this, '${url}');">`;
    }
    
    prevBtn.classList.toggle('hidden', currentLightboxIndex === 0);
    nextBtn.classList.toggle('hidden', currentLightboxIndex === lightboxItems.length - 1);
}

(window as any).openLightbox = openLightbox;
(window as any).closeLightbox = closeLightbox;
(window as any).lightboxNext = lightboxNext;
(window as any).lightboxPrev = lightboxPrev;
