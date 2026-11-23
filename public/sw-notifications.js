/* ZENO Service Worker Notifications Bridge (PWABuilder / TWA / Web Push compatible) */

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      try {
        payload = { body: event.data.text() };
      } catch {
        payload = {};
      }
    }
  }

  const title = payload.title || 'ZENO';
  const body = payload.body || 'لديك رسالة جديدة في ZENO';
  const chatId = payload.chatId ? String(payload.chatId) : '';
  const tag = payload.tag || (chatId ? `zeno-chat-${chatId}` : 'zeno-general');

  const options = {
    body,
    icon: payload.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag,
    renotify: true,
    dir: 'rtl',
    lang: 'ar',
    vibrate: [140, 60, 140],
    silent: Boolean(payload.silent),
    data: {
      chatId,
      url: chatId ? `/?chatId=${encodeURIComponent(chatId)}` : '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'ZENO_SHOW_NOTIFICATION') return;

  const title = data.title || 'ZENO';
  const chatId = data.chatId ? String(data.chatId) : '';
  const options = {
    body: data.body || '',
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || (chatId ? `zeno-chat-${chatId}` : 'zeno-general'),
    renotify: true,
    dir: 'rtl',
    lang: 'ar',
    vibrate: [140, 60, 140],
    silent: Boolean(data.silent),
    data: {
      chatId,
      url: chatId ? `/?chatId=${encodeURIComponent(chatId)}` : '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const chatId = data.chatId ? String(data.chatId) : '';
  const targetUrl = chatId ? `/?chatId=${encodeURIComponent(chatId)}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url && client.url.startsWith(self.location.origin)) {
          return client.focus().then((focused) => {
            if (focused && chatId) {
              focused.postMessage({ type: 'ZENO_OPEN_CHAT', chatId });
            } else if (client.postMessage && chatId) {
              client.postMessage({ type: 'ZENO_OPEN_CHAT', chatId });
            }
            return focused;
          });
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
