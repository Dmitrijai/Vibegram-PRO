// Полностью нативный Service Worker для тотального контроля Push-уведомлений Web/PWA
// Мы не подключаем библиотеки Firebase сюда, чтобы они не перехватывали уведомления и не дублировали их!
// Благодаря этому, мы сами решаем КОГДА показывать уведомление (только если приложение свернуто) и КУДА перекидывать по клику.

self.addEventListener('push', function(event) {
  if (!event.data) return;
  
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.error('Push data is not JSON:', event.data.text());
    return;
  }
  
  const title = payload.notification?.title || payload.data?.title || 'Новое сообщение';
  const body = payload.notification?.body || payload.data?.body || '';
  const chatId = payload.data?.chat_id;

  const options = {
    body: body,
    icon: 'pwa-icon.png', // Иконка, которая будет лежать в корне проекта (рядом с index.html)
    badge: 'pwa-icon.png',
    data: { chat_id: chatId },
    requireInteraction: true,
    tag: chatId ? `chat-${chatId}` : 'new-message', // Группировка уведомлений, предотвращает спам! Если придет 3 пуша - покажет 1.
    renotify: true
  };

  event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
          // Ищем открытую и активную вкладку
          let isFocused = false;
          for (let i = 0; i < windowClients.length; i++) {
              if (windowClients[i].focused) {
                  isFocused = true;
                  break;
              }
          }
          
          if (!isFocused) {
              // Приложение СВЕРНУТО или ЗАКРЫТО полностью - показываем СИСТЕМНОЕ уведомление
              return self.registration.showNotification(title, options);
          } else {
              // Приложение ОТКРЫТО - системное уведомление НЕ показываем,
              // вместо этого отправляем сообщение веб-странице, чтобы она показала красивый in-app Toast
              for (let i = 0; i < windowClients.length; i++) {
                  windowClients[i].postMessage({
                      type: 'FCM_MSG',
                      payload: payload
                  });
              }
          }
      })
  );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // Сразу закрываем уведомление
    
    const chatId = event.notification.data?.chat_id;
    let targetUrl = self.location.origin + self.location.pathname.replace('firebase-messaging-sw.js', '');
    if (chatId && chatId !== "undefined") {
        targetUrl += '#chat=' + chatId;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Ищем уже открытую вкладку с нашим приложением
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(self.location.hostname)) {
                    // Если вкладка найдена - обновляем URL на нужный чат (роутер отреагирует)
                    client.navigate(targetUrl); 
                    if ('focus' in client) {
                        return client.focus(); // Выводим вкладку на передний план
                    }
                    return;
                }
            }
            // Если ни одной вкладки нет (приложение было полностью закрыто) - открываем новую
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
