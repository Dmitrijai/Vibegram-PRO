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

// Инициализируем Firebase, он нужен для обновления токенов,
// но мы не будем завязываться на его onBackgroundMessage
try {
  firebase.initializeApp(firebaseConfig);
  firebase.messaging();
} catch(e) {
  console.log("Firebase SW init skip", e);
}

// 1. ПОЛНЫЙ ПЕРЕХВАТ PUSH-СОБЫТИЙ
// Это решает ВСЕ проблемы с iOS Safari и PWA. Firebase SDK на iOS часто крашится 
// из-за доступа к IndexedDB в фоне, не вызывая showNotification, что приводит к 
// бану уведомлений со стороны Apple.
self.addEventListener('push', function(event) {
  // Важно: останавливаем дальнейшую обработку (чтобы код Firebase не дублировал уведомление)
  event.stopImmediatePropagation(); 

  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch(e) { 
      console.error('push json decode error', e); 
    }
  }

  // Берем данные из блока notification или data
  const notificationTitle = payload?.notification?.title || payload?.data?.title || 'Vibegram';
  const notificationOptions = {
    body: (payload?.notification?.body || payload?.data?.body) || 'Новое сообщение',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png', // Маленькая монохромная иконка для статус бара на Android
    data: payload?.data || {},
    vibrate: [200, 100, 200, 100, 200]
  };

  // Обязательный синхронный вызов для iOS PWA: мы обещаем Apple сразу показать уведомление.
  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

// 2. ОБРАБОТКА КЛИКА ПО УВЕДОМЛЕНИЮ
self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click received.', event);
  event.notification.close();

  const data = event.notification.data || {};
  const chatId = data.chatId || data.chat_id;
  
  // Определяем URL родительского scope 
  const scopeUrl = self.registration.scope;
  let targetUrl = scopeUrl; 
  if (chatId) {
    targetUrl = scopeUrl + `?chatId=${chatId}`;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Ищем открытую вкладку с нашим мессенджером
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.indexOf(scopeUrl) !== -1 && 'focus' in client) {
          // Если нашли - отправляем туда сообщение (чтобы SPA переключил чат без перезагрузки)
          if (chatId) {
             client.postMessage({ type: 'OPEN_CHAT', chatId });
          }
          return client.focus();
        }
      }
      // Если клиент закрыт - открываем новую вкладку по URL с параметром (роутинг React разберет это)
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
