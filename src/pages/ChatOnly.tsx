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
  // Deferred to avoid blocking initial render
  useEffect(() => {
    if ('Notification' in window && permission === 'default') {
      // Delay to allow UI to render first before making network requests
      const timer = setTimeout(() => {
        requestPermission();
      }, 5000); // Increased delay to let app fully load first
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
