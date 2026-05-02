import { customToast } from './utils';
import { GoogleGenAI } from '@google/genai';

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

console.log("Loaded API Keys:", API_KEYS.length, API_KEYS.map(k => `${k.substring(0, 4)}...${k.substring(k.length - 4)}`));
console.log("Loaded HF API Keys:", HF_API_KEYS.length, HF_API_KEYS.map(k => `${k.substring(0, 4)}...${k.substring(k.length - 4)}`));

let currentKeyIndex = 0;
let currentHfKeyIndex = 0;
const keyStatus = new Map<string, number>();
const hfKeyStatus = new Map<string, number>();
const EXHAUSTED_COOLDOWN = 10 * 60 * 1000; // 10 minutes

function isQuotaError(error: any) {
    if (!error) return false;
    // Rotate on 429 (Quota/Rate limit) OR 401/403 (Invalid key/unauthorized)
    const msg = error.message?.toLowerCase() || '';
    const status = error.status || error.code;
    return status === 429 || status === 401 || status === 403 || 
           msg.includes('429') || msg.includes('401') || msg.includes('403') || 
           msg.includes('quota') || msg.includes('exhausted') || 
           msg.includes('rate limit') || msg.includes('invalid authentication credentials');
}

function isTransientError(error: any) {
    if (!error) return false;
    const msg = error.message?.toLowerCase() || '';
    const status = error.status || error.code;
    return status === 500 || status === 503 || status === 504 || msg.includes('503') || msg.includes('500') || msg.includes('504') || msg.includes('overloaded');
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
            
            if (isTransientError(error) && transientRetries < 3) {
                 console.warn('Model overloaded (503), retrying in 2 seconds...', error.message);
                 transientRetries++;
                 customToast('Сервер перегружен, ожидание...');
                 await new Promise(r => setTimeout(r, 2000));
                 continue; // Retry same key
            }
            
            if (isQuotaError(error)) {
                console.warn(`HF Key at index ${currentHfKeyIndex} hit quota/auth error. Switching key...`, error.message);
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
                    customToast('Поиск свободного ключа HF...');
                    await new Promise(r => setTimeout(r, 500));
                }
            } else {
                throw error;
            }
        }
    }
    
    console.error('All HF keys exhausted!', lastError);
    if (lastError?.message) {
        customToast(`Ошибка API: ${lastError.message.substring(0, 50)}...`);
    } else {
        customToast('Все свободные слоты запяты. Попробуйте позже.');
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

        const ai = new GoogleGenAI({ apiKey });
        
        try {
            return await action(ai);
        } catch (error: any) {
            lastError = error;
            
            if (isTransientError(error) && transientRetries < 3) {
                 console.warn('Model overloaded (503), retrying in 2 seconds...', error.message);
                 transientRetries++;
                 customToast('Сервер перегружен, ожидание...');
                 await new Promise(r => setTimeout(r, 2000));
                 continue; // Retry same key
            }
            
            if (isQuotaError(error)) {
                console.warn(`Key at index ${currentKeyIndex} hit quota/auth error. Switching key...`, error.message);
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
                    customToast('Поиск свободного ключа...');
                    await new Promise(r => setTimeout(r, 500));
                }
            } else {
                throw error;
            }
        }
    }
    
    console.error('All keys exhausted!', lastError);
    if (lastError?.message) {
        customToast(`Ошибка API: ${lastError.message.substring(0, 50)}...`);
    } else {
        customToast('Все свободные слоты запяты. Попробуйте позже.');
    }
    throw new Error('All API keys exhausted');
}
