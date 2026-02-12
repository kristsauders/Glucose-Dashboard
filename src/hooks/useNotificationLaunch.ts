import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { debugLogger } from '@/utils/debug-logger';

/**
 * Hook to handle app launch from notification on iOS PWA
 *
 * On iOS, when PWA is fully closed, notification clicks don't trigger
 * service worker events. Instead, they just open the app.
 *
 * This hook checks if:
 * 1. App was just launched (within last 3 seconds)
 * 2. There's no conversation parameter in URL
 * 3. There's a recent notification in localStorage
 *
 * If all true, navigates to the conversation from the notification.
 */
export function useNotificationLaunch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const conversationParam = searchParams.get('conversation');

  useEffect(() => {
    // Skip if there's already a conversation parameter
    if (conversationParam) {
      debugLogger.log('Notification Launch', 'Already have conversation parameter, skipping');
      return;
    }

    // Check if app was just launched (within last 3 seconds)
    const appLaunchTime = sessionStorage.getItem('app_launch_time');
    const now = Date.now();

    if (!appLaunchTime) {
      // First time opening, store launch time
      sessionStorage.setItem('app_launch_time', now.toString());
    }

    const timeSinceLaunch = now - parseInt(appLaunchTime || now.toString());
    if (timeSinceLaunch > 3000) {
      // App has been open for more than 3 seconds, not a fresh launch
      return;
    }

    // Check for pending notification in localStorage
    const pendingNotif = localStorage.getItem('pending_notification');
    if (!pendingNotif) {
      debugLogger.log('Notification Launch', 'No pending notification');
      return;
    }

    try {
      const { conversationId, timestamp } = JSON.parse(pendingNotif);
      const age = now - timestamp;

      // Only use notifications from last 10 seconds
      if (age > 10000) {
        debugLogger.log('Notification Launch', 'Notification too old, ignoring', { age });
        localStorage.removeItem('pending_notification');
        return;
      }

      debugLogger.log('Notification Launch', 'Found recent notification, navigating', {
        conversationId,
        age,
      });

      // Clear the pending notification
      localStorage.removeItem('pending_notification');

      // Navigate to conversation
      navigate(`/chat?conversation=${conversationId}`, { replace: true });

    } catch (error) {
      console.error('Failed to parse pending notification:', error);
      localStorage.removeItem('pending_notification');
    }
  }, [conversationParam, navigate]);
}
