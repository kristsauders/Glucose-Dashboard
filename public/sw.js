// Service Worker for Web Push Notifications
// Handles push notifications for Sage proactive messages

// Pending notification storage (Cache API - accessible from service worker)
const CACHE_NAME = 'sage-pending-notifications';
const NOTIFICATION_KEY = 'pending-notification';

/**
 * Store pending notification data when push is received
 * This is needed for iOS PWA where notification click events don't fire when app is fully closed
 */
async function storePendingNotification(data) {
  try {
    console.log('[SW Storage] Storing pending notification:', data);

    // Store in Cache API (accessible from service worker)
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(JSON.stringify(data));
    await cache.put(NOTIFICATION_KEY, response);

    console.log('[SW Storage] Notification stored successfully');
  } catch (error) {
    console.error('[SW Storage] Failed to store notification:', error);
  }
}

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

    // Store notification data for iOS PWA cold starts
    // iOS doesn't fire notification click events when PWA is fully closed
    // So we store the data here when push is received
    const pendingNotification = {
      conversationId: data.data?.conversationId,
      messageId: data.data?.messageId,
      timestamp: Date.now()
    };

    event.waitUntil(
      Promise.all([
        self.registration.showNotification(data.title || 'Sage', options),
        storePendingNotification(pendingNotification)
      ])
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
  const actionDefinitions = event.notification.data?.actionDefinitions || [];

  console.log('[Service Worker] Extracted conversationId:', conversationId);
  console.log('[Service Worker] Extracted messageId:', messageId);
  debugLog('Notification Click', 'Notification clicked', {
    conversationId: conversationId,
    messageId: messageId,
    hasActions: actionDefinitions.length > 0
  });

  // Check if user clicked an action button
  if (event.action && event.action !== 'open') {
    const action = actionDefinitions.find(a => a.id === event.action);

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

  // URL used only for cold-start (no existing clients)
  const urlToOpen = conversationId
    ? `/chat?conversation=${conversationId}`
    : '/chat';

  console.log('[Service Worker] URL to open (cold start fallback):', urlToOpen);
  debugLog('Notification Click', 'URL to open', { url: urlToOpen });

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        console.log('[Service Worker] Found', clientList.length, 'client windows');
        debugLog('Notification Click', 'Client windows found', { count: clientList.length });

        if (clientList.length === 0) {
          // Cold start: no existing clients — open a new window with the URL parameter.
          // The app's deep-link useEffect will pick up the ?conversation= param on load.
          console.log('[Service Worker] Cold start: opening new window at:', urlToOpen);
          debugLog('Notification Click', 'Cold start: opening new window', { url: urlToOpen });
          return clients.openWindow(urlToOpen);
        }

        // Hot start: app is already running (possibly backgrounded).
        // Send postMessage to ALL clients — this is the reliable path on iOS PWA.
        // navigate() is unreliable when the app is suspended; postMessage works as
        // long as the app process is alive.
        for (const client of clientList) {
          console.log('[Service Worker] Sending OPEN_CONVERSATION to client:', client.url);
          client.postMessage({
            type: 'OPEN_CONVERSATION',
            conversationId: conversationId,
          });
        }

        // Focus the best available window (/chat path preferred)
        let targetClient = null;
        for (const client of clientList) {
          try {
            if (new URL(client.url).pathname === '/chat') {
              targetClient = client;
              break;
            }
          } catch (_) {}
        }
        if (!targetClient) targetClient = clientList[0];

        console.log('[Service Worker] Focusing client:', targetClient.url);
        debugLog('Notification Click', 'Focusing client', { url: targetClient.url });
        return targetClient.focus();
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
