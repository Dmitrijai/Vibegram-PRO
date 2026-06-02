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

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'Новое сообщение';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: '/apple-touch-icon.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click received.');
  event.notification.close();

  // Try to find the chat URL inside data or fallback to root
  const chatId = event.notification.data?.chatId || event.notification.data?.chat_id;
  
  // URL to open if no window is already open. Adding query param.
  let targetUrl = '/'; 
  if (chatId) {
    // We can append a hash or query param so the app can detect it and open the specific chat on cold start
    targetUrl = `/?chatId=${chatId}`;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        // If so, just focus it
        if (client.url.indexOf(self.registration.scope) !== -1 && 'focus' in client) {
          // Send data to the client to open specific chat
          if (chatId) {
             client.postMessage({ type: 'OPEN_CHAT', chatId });
          }
          return client.focus();
        }
      }
      // If not, then open the target URL
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
