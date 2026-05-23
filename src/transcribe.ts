import { supabase } from './supabase';
import { customToast } from './utils';
import { executeHfWithFallback, executeApiKeyWithFallback } from './ai-keys';

export async function transcribeMedia(url: string, messageId: string, msgType?: string) {
    try {
        const btn = document.getElementById(`transcribe-btn-${messageId}`);
        if (btn) {
            btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
            btn.classList.add('pointer-events-none');
        }

        // Fetch the media file on client
        const response = await fetch(url);
        const blob = await response.blob();
        
        // Convert blob to base64 for Gemini
        const base64data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        let mimeType = blob.type || (url.includes('.mp4') ? 'video/mp4' : 'audio/webm');
        if (mimeType.includes(';')) mimeType = mimeType.split(';')[0];
        if (msgType === 'voice' || msgType === 'video_circle' || mimeType.includes('video')) {
            mimeType = 'audio/webm';
        }
        
        let resultText = '';
        try {
            // First try Gemini via Client Proxies (to bypass NGINX and Russian blocks)
            resultText = await executeApiKeyWithFallback(async (apiKey: string) => {
                 const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                 
                 const endpoints = [
                     `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
                     targetUrl
                 ];
                 
                 let lastError = null;
                 
                 for (const endpoint of endpoints) {
                     try {
                         const rsp = await fetch(endpoint, {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({
                                 contents: [{
                                     role: 'user',
                                     parts: [
                                         { text: 'Transcribe this audio/video. Return only the transcription text in the language spoken. If there is no speech, return an empty string.' },
                                         { inline_data: { mime_type: mimeType, data: base64data } }
                                     ]
                                 }]
                             })
                         });
    
                         if (!rsp.ok) {
                             const errText = await rsp.text();
                             let errMsg = errText;
                             try { 
                                 const errData = JSON.parse(errText);
                                 errMsg = errData.error?.message || errData.error || errText;
                             } catch(e) {}
                             throw Object.assign(new Error(errMsg), { status: rsp.status });
                         }
    
                         const data = await rsp.json();
                         return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                     } catch (err: any) {
                         lastError = err;
                         if (err.status >= 400 && err.status < 500 && err.status !== 403) {
                             throw err;
                         }
                     }
                 }
                 
                 throw lastError || new Error('All proxy attempts failed');
            });
        } catch (geminiError: any) {
             console.warn("Gemini transcription failed, falling back to HuggingFace:", geminiError);
             resultText = await executeHfWithFallback(async (apiKey: string) => {
                  const rsp = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo', {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${apiKey}` },
                      body: blob
                  });
                  if (!rsp.ok) {
                      const errText = await rsp.text();
                      let errMsg = errText;
                      try { 
                          const errData = JSON.parse(errText);
                          errMsg = errData.error || errText;
                      } catch(e) {}
                      throw Object.assign(new Error(errMsg), { status: rsp.status });
                  }
                  const data = await rsp.json();
                  if (data.error) throw new Error(data.error);
                  return data.text;
             });
        }

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
