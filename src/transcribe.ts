import { supabase, state } from './supabase';
import { customToast, escapeHtml } from './utils';
import { GoogleGenAI } from '@google/genai';
import { executeAiWithFallback, getAvailableGeminiKeys } from './ai-keys';
import { getOptimizedAudioForTranscriptionUrl, rewriteMediaUrl, AI_GATEWAY_URLS } from './network';
import { currentMessages } from './messages-core';
import { saveCachedMessages } from './cache';

const transcriptionCache = new Map<string, string>();

async function requestServerSideTranscription(
    fastAudioUrl: string,
    rawUrl: string,
    msgType?: string
): Promise<string | null> {
    const apiKeys = getAvailableGeminiKeys();
    if (apiKeys.length === 0) return null;

    for (const gwUrl of AI_GATEWAY_URLS) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 14000);
            const res = await fetch(`${gwUrl}/api/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audioUrl: fastAudioUrl,
                    rawUrl,
                    apiKeys: apiKeys.slice(0, 3),
                    msgType
                }),
                signal: ctrl.signal
            });
            clearTimeout(timer);
            if (res.ok) {
                const data = await res.json();
                if (data && typeof data.text === 'string') {
                    return data.text.trim() || 'Нет речи';
                }
            }
        } catch (_e) {
            // Try next gateway in AI_GATEWAY_URLS
        }
    }
    return null;
}

export async function transcribeMedia(url: string, messageId: string, msgType?: string) {
    try {
        const btn = document.getElementById(`transcribe-btn-${messageId}`);
        if (btn) {
            btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
            btn.classList.add('pointer-events-none');
        }

        let transcription = transcriptionCache.get(messageId) || '';

        if (!transcription) {
            const fastAudioUrl = getOptimizedAudioForTranscriptionUrl(url);

            // 1. Primary path: Server-side cloud-to-cloud transcription on our Edge Gateway (~150 bytes payload, immune to TSPU resets)
            const serverResult = await requestServerSideTranscription(fastAudioUrl, url, msgType);
            if (serverResult) {
                transcription = serverResult;
            } else {
                // 2. Fallback path: Client-side download of tiny 48kbps MP3 stream + Gemini Edge proxy
                let response = await fetch(fastAudioUrl);
                if (!response.ok && fastAudioUrl !== url) {
                    response = await fetch(rewriteMediaUrl(url, undefined, false));
                }
                if (!response.ok) {
                    throw new Error(`Fetch error: ${response.status}`);
                }

                const blob = await response.blob();

                const base64data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64 = (reader.result as string).split(',')[1];
                        resolve(base64);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });

                let mimeType = blob.type || (fastAudioUrl.endsWith('.mp3') ? 'audio/mp3' : url.includes('.mp4') ? 'video/mp4' : 'audio/webm');
                if (mimeType.includes(';')) {
                    mimeType = mimeType.split(';')[0];
                }
                if (mimeType === 'audio/mpeg' || fastAudioUrl.endsWith('.mp3')) {
                    mimeType = 'audio/mp3';
                } else if (msgType === 'voice' || msgType === 'video_circle' || mimeType.includes('video')) {
                    mimeType = 'audio/webm';
                }

                const result = await executeAiWithFallback(async (ai: GoogleGenAI) => {
                    return await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: [
                            {
                                role: 'user',
                                parts: [
                                    { text: 'Transcribe this audio accurately. Return ONLY the spoken text in its original language without quotes or extra commentary. If there is no speech, return an empty string.' },
                                    { inlineData: { data: base64data, mimeType } }
                                ]
                            }
                        ]
                    });
                });

                transcription = result.text?.trim() || 'Нет речи';
            }

            transcriptionCache.set(messageId, transcription);
        }

        // Update UI immediately
        const textContainer = document.getElementById(`transcription-text-${messageId}`);
        if (textContainer) {
            textContainer.innerHTML = `<div class="mt-1 text-sm text-gray-700 dark:text-gray-200 bg-black/5 dark:bg-white/5 p-2 rounded-lg animate-fadeIn ${msgType === 'video_circle' ? 'max-w-[200px]' : ''}">${escapeHtml(transcription)}</div>`;
        }
        if (btn) btn.remove();

        // Update local cached messages
        const localMsg = currentMessages.find((m) => m.id === messageId);
        if (localMsg && Array.isArray(localMsg.media) && localMsg.media.length > 0) {
            localMsg.media[0].transcription = transcription;
            if (state.activeChatId) {
                saveCachedMessages(state.activeChatId, currentMessages);
            }
        }

        // Persist transcription to Supabase in background
        const { data: msg } = await supabase
            .from('messages')
            .select('media')
            .eq('id', messageId)
            .maybeSingle();

        if (msg && Array.isArray(msg.media) && msg.media.length > 0) {
            msg.media[0].transcription = transcription;
            await supabase
                .from('messages')
                .update({ media: msg.media })
                .eq('id', messageId);
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
                errorMessage = 'Не удалось загрузить аудио для расшифровки';
            } else if (errText.includes('503') || errText.includes('overloaded')) {
                errorMessage = '🐌 Сервер нейросети перегружен. Попробуйте через пару секунд.';
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
