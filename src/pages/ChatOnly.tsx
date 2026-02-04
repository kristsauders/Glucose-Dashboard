import { useEffect } from 'react';
import { AIChat } from '../components/AIChat';
import { usePushNotifications } from '../hooks/usePushNotifications';

/**
 * Standalone chat page for mobile web app
 * Optimized for quick access without loading dashboard metrics
 * Registers service worker and requests push notification permissions
 */
export function ChatOnly() {
  const { requestPermission, permission } = usePushNotifications();

  // Auto-request notification permission on mount (if not already granted/denied)
  useEffect(() => {
    if ('Notification' in window && permission === 'default') {
      // Delay slightly to avoid overwhelming user immediately on page load
      const timer = setTimeout(() => {
        requestPermission();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [requestPermission, permission]);

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      <div className="flex-1 p-2 md:p-4 overflow-hidden">
        <div className="max-w-4xl mx-auto h-full">
          <AIChat />
        </div>
      </div>
    </div>
  );
}
