import { customToast } from './utils';
import { GoogleGenAI } from '@google/genai';
import { getActiveGatewayBaseUrl, EDGE_GATEWAY_URLS } from './network';

const obfuscatedKey = (process.env.GEMINI_API_KEY_OBFUSCATED as string) || "";
let rawKeys = "";
try {
    const reversed = obfuscatedKey.split('').reverse().join('');
    // atob is available in browser for base64 decoding
    rawKeys = atob(reversed);
} catch (e) {
    console.error("Failed to decode API keys:", e);
}

const API_KEYS = rawKeys
    .split(',')
    .map(k => k.replace(/['"]/g, '').trim())
    .filter(Boolean);

const obfuscatedHfKey = (process.env.HF_API_KEY_OBFUSCATED as string) || "";
let rawHfKeys = "";
try {
    const reversedHf = obfuscatedHfKey.split('').reverse().join('');
    rawHfKeys = atob(reversedHf);
} catch (e) {
    console.error("Failed to decode HF API keys:", e);
}

const HF_API_KEYS = rawHfKeys
    .split(',')
    .map(k => k.replace(/['"]/g, '').trim())
    .filter(Boolean);

let currentKeyIndex = 0;
let currentHfKeyIndex = 0;
let currentGatewayIndex = 0;
const keyStatus = new Map<string, number>();
const hfKeyStatus = new Map<string, number>();
const EXHAUSTED_COOLDOWN = 10 * 60 * 1000; // 10 minutes

function isQuotaError(error: any) {
    if (!error) return false;
    const msg = error.message?.toLowerCase() || '';
    const status = error.status || error.code;
    return status === 429 || status === 401 || status === 403 || 
           msg.includes('429') || msg.includes('401') || msg.includes('403') || 
           msg.includes('quota') || msg.includes('exhausted') || 
           msg.includes('rate limit') || msg.includes('invalid authentication credentials') ||
           msg.includes('api_key_invalid') || msg.includes('failed to fetch');
}

function isTransientOrLocationError(error: any) {
    if (!error) return false;
    const msg = error.message?.toLowerCase() || '';
    const status = error.status || error.code;
    return status === 500 || status === 502 || status === 503 || status === 504 ||
           msg.includes('503') || msg.includes('500') || msg.includes('502') || msg.includes('504') ||
           msg.includes('overloaded') || msg.includes('user location is not supported');
}

export async function executeHfWithFallback<T>(action: (apiKey: string) => Promise<T>): Promise<T> {
    if (HF_API_KEYS.length === 0) {
        customToast('Ключи Hugging Face не настроены. Добавьте HF_API_KEY в GitHub Secrets.');
        throw new Error('No HF API keys configured');
    }

    const now = Date.now();
    let attempts = 0;
    let transientRetries = 0;
    let lastError: any = null;
    
    while (attempts < HF_API_KEYS.length) {
        const apiKey = HF_API_KEYS[currentHfKeyIndex];
        const exhaustedAt = hfKeyStatus.get(apiKey) || 0;
        
        if (now - exhaustedAt < EXHAUSTED_COOLDOWN) {
            currentHfKeyIndex = (currentHfKeyIndex + 1) % HF_API_KEYS.length;
            attempts++;
            continue;
        }
        
        try {
            return await action(apiKey);
        } catch (error: any) {
            lastError = error;
            
            if (isTransientOrLocationError(error) && transientRetries < 3) {
                 transientRetries++;
                 await new Promise(r => setTimeout(r, 1200));
                 continue;
            }
            
            if (isQuotaError(error)) {
                hfKeyStatus.set(apiKey, Date.now());
                currentHfKeyIndex = (currentHfKeyIndex + 1) % HF_API_KEYS.length;
                attempts++;
                
                let hasUnexhaustedKeys = false;
                for (let i = 0; i < HF_API_KEYS.length; i++) {
                    if (now - (hfKeyStatus.get(HF_API_KEYS[i]) || 0) >= EXHAUSTED_COOLDOWN) {
                        hasUnexhaustedKeys = true;
                        break;
                    }
                }
                
                if (attempts < HF_API_KEYS.length && hasUnexhaustedKeys) {
                    await new Promise(r => setTimeout(r, 300));
                }
            } else {
                throw error;
            }
        }
    }
    
    if (lastError?.message) {
        customToast(`Ошибка API: ${lastError.message.substring(0, 50)}...`);
    } else {
        customToast('Все свободные слоты заняты. Попробуйте позже.');
    }
    throw new Error('All HF API keys exhausted');
}

export async function executeAiWithFallback<T>(action: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
    if (API_KEYS.length === 0) {
        customToast('Ключи API не настроены. Добавьте GEMINI_API_KEY в GitHub Secrets.');
        throw new Error('No API keys configured');
    }

    const now = Date.now();
    let attempts = 0;
    let transientRetries = 0;
    let lastError: any = null;
    
    while (attempts < API_KEYS.length) {
        const apiKey = API_KEYS[currentKeyIndex];
        const exhaustedAt = keyStatus.get(apiKey) || 0;
        
        if (now - exhaustedAt < EXHAUSTED_COOLDOWN) {
            currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
            attempts++;
            continue;
        }

        const gatewayBase = transientRetries === 0
            ? getActiveGatewayBaseUrl()
            : EDGE_GATEWAY_URLS[currentGatewayIndex % EDGE_GATEWAY_URLS.length];

        const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
                baseUrl: `${gatewayBase}/gemini`
            }
        });
        
        try {
            return await action(ai);
        } catch (error: any) {
            lastError = error;
            
            if (isTransientOrLocationError(error) && transientRetries < 3) {
                 transientRetries++;
                 currentGatewayIndex = (currentGatewayIndex + 1) % EDGE_GATEWAY_URLS.length;
                 await new Promise(r => setTimeout(r, 800));
                 continue;
            }
            
            if (isQuotaError(error)) {
                keyStatus.set(apiKey, Date.now());
                currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
                attempts++;
                
                let hasUnexhaustedKeys = false;
                for (let i = 0; i < API_KEYS.length; i++) {
                    if (now - (keyStatus.get(API_KEYS[i]) || 0) >= EXHAUSTED_COOLDOWN) {
                        hasUnexhaustedKeys = true;
                        break;
                    }
                }
                
                if (attempts < API_KEYS.length && hasUnexhaustedKeys) {
                    await new Promise(r => setTimeout(r, 250));
                }
            } else {
                throw error;
            }
        }
    }
    
    if (lastError?.message) {
        customToast(`Ошибка API: ${lastError.message.substring(0, 50)}...`);
    } else {
        customToast('Все свободные слоты заняты. Попробуйте позже.');
    }
    throw new Error('All API keys exhausted');
}
