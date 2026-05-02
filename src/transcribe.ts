import { supabase } from './supabase';
import { customToast } from './utils';
import { GoogleGenAI } from '@google/genai';
import { executeAiWithFallback } from './ai-keys';

export async function transcribeMedia(url: string, messageId: string) {
    try {
        const btn = document.getElementById(`transcribe-btn-${messageId}`);
        if (btn) {
            btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
            btn.classList.add('pointer-events-none');
        }

        // Fetch the media file
        const response = await fetch(url);
        const blob = await response.blob();
        
        // Convert blob to base64
        const base64data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        
        // Determine mime type
        let mimeType = blob.type;
        if (!mimeType) {
            mimeType = url.includes('.mp4') ? 'video/mp4' : 'audio/webm';
        }
        // Strip codec info that Gemini rejects (e.g. "audio/webm; codecs=opus" -> "audio/webm")
        if (mimeType.includes(';')) {
            mimeType = mimeType.split(';')[0];
        }

        // Call Gemini
        const result = await executeAiWithFallback(async (ai: GoogleGenAI) => {
            return await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: 'Transcribe this audio/video. Return only the transcription text in the language spoken. If there is no speech, return an empty string.' },
                            { inlineData: { data: base64data, mimeType } }
                        ]
                    }
                ]
            });
        });

        const transcription = result.text?.trim() || 'Нет речи';

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
        }

    } catch (err: any) {
        console.error('Transcription error:', err);
        
        if (!err.message?.includes('All API keys exhausted')) {
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
