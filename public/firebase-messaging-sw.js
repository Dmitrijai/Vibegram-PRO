self.addEventListener('push', function(event) {
    console.log('[SW] Push Received.', event.data.text());
    let payload = {};
    try {
        payload = event.data.json();
    } catch(e) {
        console.error("Parse push error", e);
    }
    
    // В FCM v1 данные обычно лежат в payload.notification (если отправлено с сервера) 
    // или в payload.data (если отправлено как data-only).
    const notification = payload?.notification || {};
    const data = payload?.data || {};
    
    const title = notification.title || data.title || 'Новое сообщение';
    const body = notification.body || data.body || '';
    const chatId = data.chat_id;
    
    // Генерируем URL чата
    let targetUrl = self.location.origin + self.location.pathname.replace('firebase-messaging-sw.js', '');
    if (chatId) {
        targetUrl += '#chat=' + chatId;
    }
    
    const options = {
        body: body,
        icon: '/pwa-icon.png',
        badge: '/pwa-icon.png',
        data: { url: targetUrl },
        requireInteraction: true,
        vibrate: [200, 100, 200]
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.stopImmediatePropagation();
    const targetUrl = event.notification.data?.url || '/';
    console.log('[SW] Notification click! URL:', targetUrl);

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

