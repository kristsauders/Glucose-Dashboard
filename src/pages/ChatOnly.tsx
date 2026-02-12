import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AIChat } from '../components/AIChat';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Button } from '../components/ui/button';
import { Bug } from 'lucide-react';

/**
 * Standalone chat page for mobile web app
 * Optimized for quick access without loading dashboard metrics
 * Registers service worker and requests push notification permissions
 */
export function ChatOnly() {
  const navigate = useNavigate();
  const { requestPermission, permission } = usePushNotifications();
  const [showDebugButton, setShowDebugButton] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Triple-tap anywhere to reveal debug button
  useEffect(() => {
    const handleTap = () => {
      tapCountRef.current += 1;

      if (tapCountRef.current >= 3) {
        setShowDebugButton(true);
        tapCountRef.current = 0;
      }

      // Reset tap count after 1 second
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
      }
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
      }, 1000);
    };

    document.addEventListener('click', handleTap);
    return () => {
      document.removeEventListener('click', handleTap);
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      <div className="flex-1 p-2 md:p-4 overflow-hidden">
        <div className="max-w-4xl mx-auto h-full">
          <AIChat />
        </div>
      </div>

      {/* Debug button - revealed by triple-tap anywhere */}
      {showDebugButton && (
        <div className="fixed bottom-4 right-4 z-50">
          <Button
            onClick={() => navigate('/debug')}
            size="lg"
            className="rounded-full w-14 h-14 shadow-lg"
            title="Open Debug Logs"
          >
            <Bug className="h-6 w-6" />
          </Button>
        </div>
      )}
    </div>
  );
}
