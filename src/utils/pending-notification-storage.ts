/**
 * Utilities for storing pending notifications across service worker and client
 *
 * Service workers can't access localStorage, so we use a shared approach:
 * - Service worker uses Cache API to store notification data
 * - Client reads from both Cache API and localStorage
 */

const CACHE_NAME = 'sage-pending-notifications';
const NOTIFICATION_KEY = 'pending-notification';

export interface PendingNotification {
  conversationId: string;
  messageId?: string;
  timestamp: number;
  /** Set to true when the user actively tapped the notification (vs. just receiving it). */
  clicked?: boolean;
}

/**
 * Store a pending notification (works in both service worker and client)
 */
export async function storePendingNotification(data: PendingNotification): Promise<void> {
  try {
    // Store in Cache API (accessible from service worker)
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(JSON.stringify(data));
    await cache.put(NOTIFICATION_KEY, response);

    // Also store in localStorage if available (client only)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pending_notification', JSON.stringify(data));
    }
  } catch (error) {
    console.error('[Pending Notification] Failed to store:', error);
  }
}

/**
 * Get pending notification (client only)
 */
export async function getPendingNotification(): Promise<PendingNotification | null> {
  try {
    // Try localStorage first (faster)
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('pending_notification');
      if (stored) {
        const data = JSON.parse(stored);
        // Only use notifications from last 30 seconds
        if (Date.now() - data.timestamp < 30000) {
          return data;
        }
      }
    }

    // Fall back to Cache API
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(NOTIFICATION_KEY);
    if (response) {
      const data = await response.json();
      // Only use notifications from last 30 seconds
      if (Date.now() - data.timestamp < 30000) {
        return data;
      }
    }

    return null;
  } catch (error) {
    console.error('[Pending Notification] Failed to get:', error);
    return null;
  }
}

/**
 * Clear pending notification (client only)
 */
export async function clearPendingNotification(): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pending_notification');
    }

    const cache = await caches.open(CACHE_NAME);
    await cache.delete(NOTIFICATION_KEY);
  } catch (error) {
    console.error('[Pending Notification] Failed to clear:', error);
  }
}
