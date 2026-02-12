import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { debugLogger } from '@/utils/debug-logger';

/**
 * Hook to debug notification deep-linking
 * Logs when notifications try to open conversations
 */
export function useNotificationDebugger() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Log URL parameter changes
    const conversationId = searchParams.get('conversation');
    if (conversationId) {
      debugLogger.log('URL Parameter', 'Conversation ID in URL detected', {
        conversationId,
        fullUrl: window.location.href,
      });

      // Store as pending notification for iOS PWA cold starts
      // This helps when the service worker can't navigate properly
      localStorage.setItem('pending_notification', JSON.stringify({
        conversationId,
        timestamp: Date.now(),
      }));
    }
  }, [searchParams]);

  useEffect(() => {
    // Listen for service worker messages
    const handleMessage = (event: MessageEvent) => {
      console.log('[Notification Debugger] Received service worker message:', event.data);

      if (event.data.type === 'OPEN_CONVERSATION') {
        debugLogger.log('Service Worker Message', 'OPEN_CONVERSATION received', {
          conversationId: event.data.conversationId,
        });
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);

      // Log that we're listening
      debugLogger.log('Notification Debugger', 'Started listening for service worker messages');

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }
  }, []);
}
