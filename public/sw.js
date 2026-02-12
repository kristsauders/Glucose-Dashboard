// Service Worker for Web Push Notifications
// Handles push notifications for Sage proactive messages

// Simple debug logger for PWA (stores in localStorage)
function debugLog(source, message, data) {
  const log = {
    timestamp: new Date().toISOString(),
    source: source,
    message: message,
    data: data ? JSON.stringify(data, null, 2) : undefined
  };

  console.log(`[${source}]`, message, data);

  try {
    // Note: Service workers can't directly access localStorage
    // We'll send this to the client via postMessage
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'DEBUG_LOG',
          log: log
        });
      });
    });
  } catch (error) {
    console.error('Failed to send debug log:', error);
  }
}

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  debugLog('Service Worker', 'Installing...');
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
    console.log('[Service Worker] conversationId in push data:', data.data?.conversationId);

    const options = {
      body: data.body,
      icon: data.icon || '/sage-icon.png',
      badge: data.badge || '/sage-badge.png',
      tag: data.data?.conversationId || 'sage-notification',
      data: data.data,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      // Use action buttons from payload if provided, otherwise default "Open" button
      actions: data.actions || [
        {
          action: 'open',
          title: 'Open'
        }
      ]
    };

    console.log('[Service Worker] Creating notification with data:', options.data);

    event.waitUntil(
      self.registration.showNotification(data.title || 'Sage', options)
    );
  } catch (error) {
    console.error('[Service Worker] Error processing push:', error);
  }
});

// Handle notification click
self.addEventListener('notificationclick', async (event) => {
  console.log('[Service Worker] Notification clicked');
  console.log('[Service Worker] Event action:', event.action);
  console.log('[Service Worker] Notification data:', event.notification.data);

  event.notification.close();

  const conversationId = event.notification.data?.conversationId;
  const messageId = event.notification.data?.messageId;
  const actions = event.notification.data?.actions || [];

  console.log('[Service Worker] Extracted conversationId:', conversationId);
  console.log('[Service Worker] Extracted messageId:', messageId);
  debugLog('Notification Click', 'Notification clicked', {
    conversationId: conversationId,
    messageId: messageId,
    hasActions: actions.length > 0
  });

  // Check if user clicked an action button
  if (event.action && event.action !== 'open') {
    const action = actions.find(a => a.id === event.action);

    if (action) {
      console.log('[Service Worker] Action button clicked:', action);

      // Send action response to backend
      try {
        // Get the auth token from IndexedDB or localStorage
        // For now, we'll try to get it from the client
        const response = await fetch('/api/notifications/action-response', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Note: We need to include the auth token here
            // This will be handled by the fetch interceptor in the client
          },
          body: JSON.stringify({
            messageId: messageId,
            conversationId: conversationId,
            actionId: action.id,
            message: action.message
          }),
          credentials: 'include' // Include cookies for auth
        });

        if (response.ok) {
          console.log('[Service Worker] Action response sent successfully');
        } else {
          console.error('[Service Worker] Action response failed:', response.status);
        }
      } catch (error) {
        console.error('[Service Worker] Error sending action response:', error);
      }
    }
  }

  // Open or focus the chat window
  const urlToOpen = conversationId
    ? `/chat?conversation=${conversationId}`
    : '/chat';

  console.log('[Service Worker] URL to open:', urlToOpen);
  debugLog('Notification Click', 'URL to open', { url: urlToOpen });

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        console.log('[Service Worker] Found', clientList.length, 'client windows');

        // For PWAs, always navigate to the URL with conversation parameter
        // This is more reliable than postMessage for backgrounded apps
        console.log('[Service Worker] Opening/navigating to:', urlToOpen);
        debugLog('Notification Click', 'Opening window with URL (works for new and existing windows)', {
          url: urlToOpen,
          clientCount: clientList.length
        });

        // openWindow will either:
        // - Navigate existing window to the new URL (PWA behavior)
        // - Open a new tab/window (browser behavior)
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
