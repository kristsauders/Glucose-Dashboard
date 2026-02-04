// Service Worker for Web Push Notifications
// Handles push notifications for Sage proactive messages

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting(); // Activate immediately
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(clients.claim()); // Take control of all clients immediately
});

// Handle push notification received
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push event received:', event);

  if (!event.data) {
    console.log('[Service Worker] Push event but no data');
    return;
  }

  try {
    const data = event.data.json();
    console.log('[Service Worker] Push data:', data);

    const options = {
      body: data.body,
      icon: data.icon || '/sage-icon.png',
      badge: data.badge || '/sage-badge.png',
      tag: data.data?.conversationId || 'sage-notification',
      data: data.data,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      actions: [
        {
          action: 'open',
          title: 'Open'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Sage', options)
    );
  } catch (error) {
    console.error('[Service Worker] Error processing push:', error);
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event);

  event.notification.close();

  const conversationId = event.notification.data?.conversationId;
  const urlToOpen = conversationId
    ? `/chat?conversation=${conversationId}`
    : '/chat';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open to the chat app
        for (const client of clientList) {
          const clientUrl = new URL(client.url);

          // If chat window is already open
          if (clientUrl.pathname === '/chat' && 'focus' in client) {
            // Send message to client to load the conversation
            if (conversationId) {
              client.postMessage({
                type: 'OPEN_CONVERSATION',
                conversationId: conversationId,
              });
            }
            return client.focus();
          }
        }

        // No chat window open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
