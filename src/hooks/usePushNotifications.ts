import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';
const TOKEN_KEY = 't1d_auth_token';

// Helper function to convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as BufferSource;
}

export function usePushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const token = localStorage.getItem(TOKEN_KEY);

  // Check current subscription status on mount
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    if ('serviceWorker' in navigator && token) {
      checkSubscription();
    }
  }, [token]);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('[usePushNotifications] Error checking subscription:', error);
    }
  };

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.error('[usePushNotifications] This browser does not support notifications');
      return false;
    }

    if (!token) {
      console.error('[usePushNotifications] User not authenticated');
      return false;
    }

    setIsLoading(true);

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission !== 'granted') {
        console.log('[usePushNotifications] Notification permission denied');
        setIsLoading(false);
        return false;
      }

      // Register service worker if not already registered
      let registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[usePushNotifications] Service worker registered');
      }

      await navigator.serviceWorker.ready;

      // Get VAPID public key from backend
      const vapidResponse = await fetch(`${API_BASE_URL}/api/notifications/vapid-public-key`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!vapidResponse.ok) {
        throw new Error('Failed to get VAPID public key');
      }

      const { publicKey } = await vapidResponse.json();

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to backend
      const subscribeResponse = await fetch(`${API_BASE_URL}/api/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (!subscribeResponse.ok) {
        throw new Error('Failed to save subscription');
      }

      setIsSubscribed(true);
      console.log('[usePushNotifications] ✓ Push notification subscription successful');
      return true;
    } catch (error) {
      console.error('[usePushNotifications] ✗ Error requesting notification permission:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const unsubscribe = useCallback(async () => {
    if (!token) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Remove from backend
        await fetch(`${API_BASE_URL}/api/notifications/unsubscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        // Unsubscribe from browser
        await subscription.unsubscribe();
        setIsSubscribed(false);
        console.log('[usePushNotifications] Unsubscribed from push notifications');
      }
    } catch (error) {
      console.error('[usePushNotifications] Error unsubscribing:', error);
    }
  }, [token]);

  return {
    isSubscribed,
    isLoading,
    permission,
    requestPermission,
    unsubscribe,
  };
}
