import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { debugLogger } from '@/utils/debug-logger';
import { getPendingNotification, clearPendingNotification } from '@/utils/pending-notification-storage';

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

    // Check for pending notification using the utility
    // This checks both Cache API (from service worker) and localStorage
    getPendingNotification().then(pendingNotif => {
      if (!pendingNotif) {
        debugLogger.log('Notification Launch', 'No pending notification');
        return;
      }

      const { conversationId, timestamp } = pendingNotif;
      const age = now - timestamp;

      debugLogger.log('Notification Launch', 'Found recent notification, navigating', {
        conversationId,
        age,
      });

      // Clear the pending notification
      clearPendingNotification();

      // Navigate to conversation
      navigate(`/chat?conversation=${conversationId}`, { replace: true });
    }).catch(error => {
      console.error('Failed to get pending notification:', error);
      debugLogger.log('Notification Launch', 'Error getting pending notification', {
        error: error.message
      });
    });
  }, [conversationParam, navigate]);
}
