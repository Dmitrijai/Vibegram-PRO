import { supabase } from './supabase';
import { customToast } from './utils';
import { executeHfWithFallback } from './ai-keys';

export async function transcribeMedia(url: string, messageId: string, msgType?: string) {
    try {
        const btn = document.getElementById(`transcribe-btn-${messageId}`);
        if (btn) {
            btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
            btn.classList.add('pointer-events-none');
        }

        // Fetch the media file
        const response = await fetch(url);
        const blob = await response.blob();
        
        // Use HuggingFace Whisper API directly on the blob to bypass Gemini regional restrictions!
        // HF Whisper automatically extracts audio from webm/mp4 blobs.
        const resultText = await executeHfWithFallback(async (apiKey: string) => {
             const rsp = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo', {
                 method: 'POST',
                 headers: {
                     'Authorization': `Bearer ${apiKey}`,
                     // Do not set Content-Type so it sends the raw binary blob
                 },
                 body: blob
             });
             
             if (!rsp.ok) {
                 const errText = await rsp.text();
                 let status = rsp.status;
                 throw Object.assign(new Error(errText), { status });
             }
             
             const data = await rsp.json();
             if (data.error) throw new Error(data.error);
             return data.text;
        });

        const transcription = resultText?.trim() || 'Нет речи';

        // Save transcription to message
        const { data: msg, error: fetchError } = await supabase
            .from('messages')
            .select('media')
            .eq('id', messageId)
            .single();

        if (fetchError || !msg) throw fetchError;

        const media = msg.media || [];
        if (media.length > 0) {
            media[0].transcription = transcription;
            
            const { error: updateError } = await supabase
                .from('messages')
                .update({ media })
                .eq('id', messageId);
                
            if (updateError) throw updateError;
            
            const textContainer = document.getElementById(`transcription-text-${messageId}`);
            if (textContainer) {
                textContainer.innerHTML = `<div class="mt-1 text-sm text-gray-700 dark:text-gray-200 bg-black/5 dark:bg-white/5 p-2 rounded-lg animate-fadeIn ${msgType === 'video_circle' ? 'max-w-[200px]' : ''}">${transcription}</div>`;
            }
            if (btn) btn.remove();
        }

    } catch (err: any) {
        console.error('Transcription error:', err);
        
        if (!err.message?.includes('All HF API keys exhausted') && !err.message?.includes('All API keys exhausted')) {
            let errorMessage = `Ошибка расшифровки: ${err.message?.substring(0, 50)}`;
            const errText = err.message?.toLowerCase() || '';
            if (errText.includes('quota') || errText.includes('429') || errText.includes('exhausted') || errText.includes('rate limit')) {
                errorMessage = '⚡ Превышен лимит запросов. Попробуйте позже.';
            } else if (errText.includes('safety') || errText.includes('blocked') || errText.includes('filter')) {
                errorMessage = '🛡️ Расшифровка заблокирована фильтром безопасности.';
            } else if (errText.includes('fetch')) {
                errorMessage = 'Не удалось загрузить файл для расшифровки';
            } else if (errText.includes('503') || errText.includes('overloaded')) {
                errorMessage = '🐌 Сервер нейросети перегружен. Попробуйте через пару минут.';
            }
            customToast(errorMessage);
        }
        
        const btn = document.getElementById(`transcribe-btn-${messageId}`);
        if (btn) {
            btn.innerHTML = `<span class="text-[10px] font-bold">Aa</span>`;
            btn.classList.remove('pointer-events-none');
        }
    }
}
