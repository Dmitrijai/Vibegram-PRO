import { supabase, state } from './supabase';
import { customToast, escapeHtml, getLocalMediaBlob } from './utils';
import { GoogleGenAI } from '@google/genai';
import { executeAiWithFallback, getAvailableGeminiKeys } from './ai-keys';
import { getOptimizedAudioForTranscriptionUrl, rewriteMediaUrl, AI_GATEWAY_URLS } from './network';
import { currentMessages } from './messages-core';
import { saveCachedMessages } from './cache';

const TX_STORAGE_KEY = 'vibegram_tx_cache_v1';
const transcriptionCache = new Map<string, string>();

// Hydrate persistent transcription cache on load
try {
    const raw = localStorage.getItem(TX_STORAGE_KEY);
    if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === 'string' && v) transcriptionCache.set(k, v);
            }
        }
    }
} catch {}

function saveTranscriptionToCache(messageId: string, url: string, text: string) {
    if (!text) return;
    transcriptionCache.set(messageId, text);
    if (url) transcriptionCache.set(url.split('?')[0], text);
    try {
        const obj: Record<string, string> = {};
        const entries = Array.from(transcriptionCache.entries()).slice(-200);
        for (const [k, v] of entries) obj[k] = v;
        localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(obj));
    } catch {}
}

export function getCachedTranscription(messageId: string, url?: string): string | undefined {
    return transcriptionCache.get(messageId) || (url ? transcriptionCache.get(url.split('?')[0]) : undefined);
}

async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function requestServerSideTranscription(
    fastAudioUrl: string,
    rawUrl: string,
    msgType?: string,
    localAudioBase64?: string,
    localMimeType?: string
): Promise<string | null> {
    const apiKeys = getAvailableGeminiKeys();
    if (apiKeys.length === 0) return null;

    const payload = JSON.stringify({
        audioUrl: fastAudioUrl,
        rawUrl,
        audioBase64: localAudioBase64,
        mimeType: localMimeType,
        apiKeys: apiKeys.slice(0, 6),
        msgType
    });

    const callGateway = async (gwUrl: string, timeoutMs: number): Promise<string> => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(`${gwUrl.replace(/\/$/, '')}/api/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                signal: ctrl.signal
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && typeof data.text === 'string') {
                return data.text.trim() || 'Нет речи';
            }
            throw new Error('Empty transcription');
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    };

    // Race top 2 Edge Gateways in parallel so cold starts or slow nodes never delay transcription
    const primaryGateways = AI_GATEWAY_URLS.slice(0, 2);
    if (primaryGateways.length > 0) {
        try {
            return await Promise.any(primaryGateways.map(gw => callGateway(gw, 11000)));
        } catch {
            // Try remaining gateways if top 2 failed
        }
    }

    for (const gwUrl of AI_GATEWAY_URLS.slice(2)) {
        try {
            return await callGateway(gwUrl, 12000);
        } catch {
            // Continue
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

        let transcription = getCachedTranscription(messageId, url) || '';

        if (!transcription) {
            const fastAudioUrl = getOptimizedAudioForTranscriptionUrl(url);
            const localBlob = getLocalMediaBlob(url);
            let localBase64: string | undefined;
            let localMime: string | undefined;

            // If we just recorded this voice note or small video circle locally (< 350KB), send base64 directly to skip Cloudinary download
            if (localBlob && localBlob.size < 350 * 1024) {
                try {
                    localBase64 = await blobToBase64(localBlob);
                    localMime = localBlob.type ? localBlob.type.split(';')[0] : 'audio/webm';
                    if (localMime.includes('video')) localMime = 'audio/webm';
                } catch {}
            }

            // 1. Primary path: Server-side cloud-to-cloud transcription on our Edge Gateway (downloads tiny 16kHz mono MP3 in EU/US + Gemini 2.5 Flash thinkingBudget: 0)
            const serverResult = await requestServerSideTranscription(fastAudioUrl, url, msgType, localBase64, localMime);
            if (serverResult) {
                transcription = serverResult;
            } else {
                // 2. Fallback path: Client-side download of tiny 32kbps 16kHz MP3 stream (or local blob) + Gemini Edge proxy
                let blob = localBlob;
                if (!blob) {
                    let response = await fetch(fastAudioUrl);
                    if (!response.ok && fastAudioUrl !== url) {
                        response = await fetch(rewriteMediaUrl(url, undefined, false));
                    }
                    if (!response.ok) {
                        throw new Error(`Fetch error: ${response.status}`);
                    }
                    blob = await response.blob();
                }

                const base64data = localBase64 || (await blobToBase64(blob));

                let mimeType = localMime || blob.type || (fastAudioUrl.endsWith('.mp3') ? 'audio/mp3' : url.includes('.mp4') ? 'video/mp4' : 'audio/webm');
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
                        ],
                        config: {
                            temperature: 0.1,
                            thinkingConfig: { thinkingBudget: 0 }
                        }
                    });
                });

                transcription = result.text?.trim() || 'Нет речи';
            }

            saveTranscriptionToCache(messageId, url, transcription);
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
