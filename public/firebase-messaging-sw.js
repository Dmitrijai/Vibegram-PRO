// 1. УБЕДИТЕЛЬНО ПЕРЕХВАТЫВАЕМ КЛИК ДО ФАЙРБЕЙЗА
// Так как мы добавляем слушатель ДО importScripts, он выполнится ПЕРВЫМ.
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.stopImmediatePropagation(); // Блокируем стандартный обработчик Firebase, который открывал слеш (/) и выдавал 404

    console.log('[SW] Notification Clicked!', event.notification.data);
    
    // Достаем chatId. Firebase может прятать данные глубоко в объекте
    const fcmData = event.notification.data?.FCM_MSG?.data || event.notification.data || {};
    let chatId = fcmData.chat_id;
    
    // Альтернативный хак: если Андроид послал линк /#chat=123, вырежем оттуда chatId
    const fcmOptionsLink = event.notification.data?.FCM_MSG?.notification?.fcm_options?.link;
    if (!chatId && fcmOptionsLink && fcmOptionsLink.includes('chat=')) {
        chatId = fcmOptionsLink.split('chat=')[1];
    }
    
    // Динамический URL приложения:
    // self.location.pathname вернет что-то вроде /Vibegram-PRO/firebase-messaging-sw.js
    // Мы отрезаем имя файла, и получаем корень PWA (/Vibegram-PRO/ или просто /)
    let targetUrl = self.location.origin + self.location.pathname.replace('firebase-messaging-sw.js', '');
    if (chatId) {
        targetUrl += '#chat=' + chatId;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Если есть открытые окна приложения, используем первое попавшееся
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url && 'focus' in client) {
                    client.navigate(targetUrl); // заставляем вкладку обновить хэш
                    return client.focus();       // и выносим ее на передний план ПК/Телефона
                }
            }
            // Если ни одного окна не было открыто (приложение закрыто), открываем новое!
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// 2. ПОДКЛЮЧАЕМ FIREBASE SDK ПОЗЖЕ
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyB_lZqseELqMCLRsQ_X_ToDl0XpGlRpwyQ",
    authDomain: "vibegram-b463f.firebaseapp.com",
    projectId: "vibegram-b463f",
    storageBucket: "vibegram-b463f.firebasestorage.app",
    messagingSenderId: "1067656273348",
    appId: "1:1067656273348:web:8ad7a2c87f2112e21c9891"
};

const app = firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging(app);

// Пусть Firebase сам рисует уведомления, если приложение закрыто.
// Но если оно открыто и в фокусе, Firebase отдаст пуш в onMessage на клиенте.
