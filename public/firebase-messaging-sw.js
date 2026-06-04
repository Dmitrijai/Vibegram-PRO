// 1. ПЕРЕХВАТЫВАЕМ КЛИК ДО ФАЙРБЕЙЗА
// Это гарантирует, что при клике на окно мы 100% перекинем в чат!
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.stopImmediatePropagation(); // Блокируем стандартный обработчик Firebase

    console.log('[SW] Notification Clicked!', event.notification.data);
    
    // Достаем chatId (Firebase кладет дату внутрь FCM_MSG.data)
    const fcmData = event.notification.data?.FCM_MSG?.data || event.notification.data || {};
    const chatId = fcmData.chat_id;
    
    // Динамический URL (подойдет и для localhost, и для GitHub Pages /Vibegram/)
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
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // Если ни одного окна не было открыто, открываем новое!
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

