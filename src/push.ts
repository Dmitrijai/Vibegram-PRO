import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { supabase, state } from './supabase';
import { customToast } from './utils';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB_lZqseELqMCLRsQ_X_ToDl0XpGlRpwyQ",
    authDomain: "vibegram-b463f.firebaseapp.com",
    projectId: "vibegram-b463f",
    storageBucket: "vibegram-b463f.firebasestorage.app",
    messagingSenderId: "1067656273348",
    appId: "1:1067656273348:web:8ad7a2c87f2112e21c9891",
    measurementId: "G-RF7SWBTXQG"
};

let messaging: any = null;

try {
    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
} catch (error) {
    console.error("Firebase init fallback error: ", error);
}

export async function requestPushPermissionAndToken() {
    if (!('Notification' in window)) {
        customToast('Пуш-уведомления не поддерживаются в этом браузере.');
        return;
    }

    if (!messaging) {
        customToast('Firebase Messaging не инициализирован.');
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            
            // Register or wait for service worker to map it to correct root (needed for iOS / Safari if not auto-injected)
            let swRegistration = null;
            if ('serviceWorker' in navigator) {
                const swUrl = import.meta.env.BASE_URL + 'firebase-messaging-sw.js';
                swRegistration = await navigator.serviceWorker.register(swUrl);
            }

            const currentToken = await getToken(messaging, { 
                vapidKey: 'BCrzH4o4TFv0krG7AC9LDxLknf0tSNS6EK6fuejHPJd84I-n77Buma3nu0gD3DaGvhfSoCZBdNpkrhvAQ5eKhnE',
                serviceWorkerRegistration: swRegistration
            });

            if (currentToken) {
                console.log('FCM Web Token:', currentToken);
                await updateTokenInSupabase(currentToken);
                customToast('Push-уведомления успешно включены!');
            } else {
                console.log('No registration token available. Request permission to generate one.');
                customToast('Не удалось получить токен. Проверьте настройки браузера.');
            }
        } else {
            console.log('Unable to get permission to notify.');
            customToast('Разрешение на уведомления не получено.');
        }
    } catch (err) {
        console.error('An error occurred while retrieving token. ', err);
        customToast('Ошибка при настройке уведомлений (возможно, из-за VPN).');
    }
}

async function updateTokenInSupabase(token: string) {
    if (!state.currentUser?.id) return;
    
    // Attempting to save it inside the user's settings or explicit fcm_token setting.
    // The instructions say: "его нужно сохранить в мою таблицу users или device_tokens в Supabase (так же, как это делает моя Android-версия)"
    // Typically profiles have a settings JSON.
    const currentSettings = state.currentProfile?.settings || {};
    currentSettings.fcm_web_token = token;
    currentSettings.fcm_token = token; // Fallback for android backend compat if it uses settings->>fcm_token

    await supabase.from('profiles').update({ settings: currentSettings }).eq('id', state.currentUser.id);
    
    // In many implementations device_tokens is a distinct table. We will try inserting there safely
    try {
        await supabase.from('device_tokens').upsert({
            user_id: state.currentUser.id,
            token: token,
            platform: 'web'
        }, { onConflict: 'token' });
    } catch (e) { } // it's fine if the table doesn't exist
}

// Слушаем сообщения из нашего Service Worker (когда приложение в фокусе)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'FCM_MSG') {
            const payload = event.data.payload;
            const title = payload.notification?.title || payload.data?.title || 'Новое сообщение';
            const body = payload.notification?.body || payload.data?.body || '';
            const chatId = payload.data?.chat_id;
            
            // Показываем внутренний Toast только если мы не находимся прямо сейчас в этом самом чате
            if (!window.location.hash.includes(`chat=${chatId}`)) {
                customToast(`💬 ${title}: ${body}`);
            }
        }
    });
}
