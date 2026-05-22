import { isSelectionMode } from './selection';
import Panzoom from '@panzoom/panzoom';

let lightboxItems: string[] = [];
let currentLightboxIndex = 0;
let currentPanzoom: any = null;

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
    if (currentPanzoom) {
        currentPanzoom.destroy();
        currentPanzoom = null;
    }
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
    
    if (currentPanzoom) {
        currentPanzoom.destroy();
        currentPanzoom = null;
    }
    
    if (isVideo) {
        content.innerHTML = `<video src="${url}" class="max-w-full max-h-full object-contain rounded-lg shadow-2xl" controls autoplay onerror="this.onerror=null; window.handleMediaError(this, '${url}');"></video>`;
    } else {
        content.innerHTML = `<img src="${url}" id="lightbox-zoom-img" class="max-w-full max-h-full object-contain rounded-lg shadow-2xl origin-center" onerror="this.onerror=null; window.handleMediaError(this, '${url}');">`;
        setTimeout(() => {
            const img = document.getElementById('lightbox-zoom-img') as HTMLImageElement;
            if (img && content) {
                currentPanzoom = Panzoom(img, {
                    maxScale: 5,
                    minScale: 1,
                    step: 0.2
                });
                
                content.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    currentPanzoom.zoomWithWheel(e);
                }, { passive: false });
                
                // Single click to zoom
                img.addEventListener('click', (e) => {
                    e.preventDefault();
                    const currentScale = currentPanzoom.getScale();
                    if (currentScale > 1) {
                        currentPanzoom.reset({ animate: true });
                    } else {
                        currentPanzoom.zoom(2.5, { animate: true });
                    }
                });
            }
        }, 50);
    }
    
    prevBtn.classList.toggle('hidden', currentLightboxIndex === 0);
    nextBtn.classList.toggle('hidden', currentLightboxIndex === lightboxItems.length - 1);
}

(window as any).openLightbox = openLightbox;
(window as any).closeLightbox = closeLightbox;
(window as any).lightboxNext = lightboxNext;
(window as any).lightboxPrev = lightboxPrev;
