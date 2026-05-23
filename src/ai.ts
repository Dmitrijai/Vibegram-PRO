import { state } from './supabase';
import { renderMediaModal } from './messages-media';
import { customAlert } from './utils';

export async function generateAiImage() {
    const input = document.getElementById('message-input') as HTMLTextAreaElement;
    if (!input) return;
    
    let text = input.value;
    if (!text.startsWith('@ai ')) return;
    const prompt = text.replace('@ai ', '').trim();
    if (!prompt) return alert('Введите запрос для генерации');

    const abortController = new AbortController();

    // Setup loading UI
    const generateBtn = document.getElementById('ai-generate-btn') as HTMLButtonElement;
    generateBtn.disabled = true;
    const originalContent = generateBtn.innerHTML;
    generateBtn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>';
    
    // Add loading overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/60 z-[200] flex flex-col items-center justify-center text-white backdrop-blur-sm transition-opacity duration-300';
    overlay.innerHTML = `
        <div class="w-20 h-20 mb-4 relative">
            <div class="absolute inset-0 rounded-full border-4 border-purple-500/30"></div>
            <div class="absolute inset-0 rounded-full border-4 border-purple-500 border-t-transparent animate-spin"></div>
            <svg class="w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
        </div>
        <div class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500 animate-pulse">Создаем магию...</div>
        <div class="text-sm text-gray-300 mt-2">Рисуем: ${prompt}</div>
        <button id="cancel-ai-btn" class="mt-8 px-6 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full font-medium transition-all transform hover:scale-105 flex items-center gap-2 backdrop-blur-md border border-red-400/30 shadow-lg shadow-red-500/20">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            Отменить
        </button>
    `;
    document.body.appendChild(overlay);

    document.getElementById('cancel-ai-btn')?.addEventListener('click', () => {
        abortController.abort();
    });

    try {
        const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
        const response = await fetch(pollUrl, { signal: abortController.signal });
        if (!response.ok) {
            throw new Error(`Ошибка генерации: ${response.status}`);
        }
        const imageBlob = await response.blob();
        
        if (!imageBlob) throw new Error("Изображение не удалось сгенерировать.");

        // Create a File object
        const file = new File([imageBlob], `ai_generated_${Date.now()}.jpg`, { type: 'image/jpeg' });
        (file as any).asFile = false; // Important flag to treat as media, not generic file
        
        // Add to selected files
        state.selectedFiles = [...state.selectedFiles, file];
        
        // Clear input and update UI
        input.value = '';
        input.style.height = '';
        if ((window as any).handleInput) {
            (window as any).handleInput();
        }
        
        // Open the media modal
        document.getElementById('modal-overlay')?.classList.remove('hidden');
        renderMediaModal();
        
    } catch (e: any) {
        if (e.name === 'AbortError') {
            console.log('Генерация отменена пользователем');
            return;
        }
        console.error('AI Error:', e);
        if (!e.message?.includes('All HF API keys exhausted')) {
            let errorMessage = 'Произошла неизвестная ошибка при генерации изображения.';
            const errText = e.message?.toLowerCase() || '';
            
            if (errText.includes('quota') || errText.includes('429') || errText.includes('exhausted') || errText.includes('rate limit')) {
                errorMessage = '⚡ Превышен лимит запросов к нейросети. Пожалуйста, попробуйте немного позже.';
            } else if (errText.includes('safety') || errText.includes('blocked') || errText.includes('filter')) {
                errorMessage = '🛡️ Ваш запрос отклонен фильтром безопасности. Попробуйте изменить формулировку.';
            } else if (e.message) {
                errorMessage = '🤖 Ошибка: ' + e.message;
            }
            
            customAlert(errorMessage);
        }
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = originalContent;
        // Fade out overlay
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.remove(), 300);
    }
}
(window as any).generateAiImage = generateAiImage;
