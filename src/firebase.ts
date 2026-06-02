import { initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";
import { supabase, state } from "./supabase";

export const firebaseConfig = {
  apiKey: "AIzaSyB_lZqseELqMCLRsQ_X_ToDl0XpGlRpwyQ",
  authDomain: "vibegram-b463f.firebaseapp.com",
  projectId: "vibegram-b463f",
  storageBucket: "vibegram-b463f.firebasestorage.app",
  messagingSenderId: "1067656273348",
  appId: "1:1067656273348:web:8ad7a2c87f2112e21c9891",
  measurementId: "G-RF7SWBTXQG"
};

const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);

// VAPID key supplied by the user
const VAPID_KEY = "BCrzH4o4TFv0krG7AC9LDxLknf0tSNS6EK6fuejHPJd84I-n77Buma3nu0gD3DaGvhfSoCZBdNpkrhvAQ5eKhnE";

export async function requestWebPushPermission() {
  if (!('serviceWorker' in navigator)) {
    alert("Ваш браузер не поддерживает Service Workers (необходимо для Push).");
    return;
  }
  
  if (!('PushManager' in window)) {
    alert("Ваш браузер не поддерживает Push API.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Notification permission granted.');
      
      const swPath = (import.meta as any).env?.BASE_URL ? (import.meta as any).env.BASE_URL + 'firebase-messaging-sw.js' : './firebase-messaging-sw.js';
      const registration = await navigator.serviceWorker.register(swPath);
      console.log('Service Worker registered with scope:', registration.scope);

      const currentToken = await getToken(messaging, { 
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration 
      });

      if (currentToken) {
        console.log("FCM Web Token received:", currentToken);
        // Save to Supabase (assuming a device_tokens table or JSON in profiles)
        // Check current profile tokens logic:
        if (state.currentUser) {
           const { error } = await supabase.from('profiles').update({
               fcm_web_token: currentToken
           }).eq('id', state.currentUser.id);
           
           if (error) {
               console.error("Error saving token to Supabase:", error);
           } else {
               alert("Push-уведомления успешно включены!");
           }
        }
      } else {
        console.log('No registration token available. Request permission to generate one.');
      }
    } else {
      alert("Вы не дали разрешение на уведомления.");
    }
  } catch (err) {
    console.error('An error occurred while retrieving token. ', err);
    alert("Ошибка при получении Push-токена: " + (err as any).message);
  }
}

// Make accessible to the global window object for onclick handlers
if (typeof window !== 'undefined') {
  (window as any).requestWebPushPermission = requestWebPushPermission;
}
