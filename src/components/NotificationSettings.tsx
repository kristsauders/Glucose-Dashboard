import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bell, BellOff, Check, AlertCircle, Send } from 'lucide-react';

const TOKEN_KEY = 't1d_auth_token';

export function NotificationSettings() {
  const [preferences, setPreferences] = useState({
    proactive_enabled: true,
    frequency: 'normal' as 'low' | 'normal' | 'high',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return;

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/notifications/preferences`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
      }
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreferences = async (updates: Partial<typeof preferences>) => {
    setIsSaving(true);
    setMessage(null);

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setMessage({ type: 'error', text: 'Not authenticated' });
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/notifications/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        setPreferences(prev => ({ ...prev, ...updates }));
        setMessage({ type: 'success', text: 'Preferences updated successfully' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error('Failed to update preferences');
      }
    } catch (error) {
      console.error('Failed to update notification preferences:', error);
      setMessage({ type: 'error', text: 'Failed to update preferences' });
    } finally {
      setIsSaving(false);
    }
  };

  const sendTestNotification = async (rich: boolean) => {
    setIsSendingTest(true);
    setMessage(null);

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setMessage({ type: 'error', text: 'Not authenticated' });
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/notifications/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rich,
          message: rich ? 'Did you receive this notification with action buttons?' : undefined
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMessage({
            type: 'success',
            text: rich
              ? 'Rich notification sent! Check your device and click an action button.'
              : 'Test notification sent! Check your device.'
          });
          setTimeout(() => setMessage(null), 5000);
        } else {
          setMessage({ type: 'error', text: data.message || 'Failed to send test notification' });
        }
      } else {
        throw new Error('Failed to send test notification');
      }
    } catch (error) {
      console.error('Failed to send test notification:', error);
      setMessage({ type: 'error', text: 'Failed to send test notification' });
    } finally {
      setIsSendingTest(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">Loading preferences...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Label className="text-base">Push Notifications</Label>
            <CardDescription>
              Receive proactive insights and messages from Sage on your device
            </CardDescription>
          </div>
          <Button
            variant={preferences.proactive_enabled ? "default" : "outline"}
            size="sm"
            onClick={() => updatePreferences({ proactive_enabled: !preferences.proactive_enabled })}
            disabled={isSaving}
          >
            {preferences.proactive_enabled ? (
              <>
                <Bell className="h-4 w-4 mr-2" />
                Enabled
              </>
            ) : (
              <>
                <BellOff className="h-4 w-4 mr-2" />
                Disabled
              </>
            )}
          </Button>
        </div>

        {preferences.proactive_enabled && (
          <>
            <div className="space-y-2">
              <Label className="text-sm">Notification Frequency</Label>
              <div className="flex gap-2">
                {(['low', 'normal', 'high'] as const).map((freq) => (
                  <Button
                    key={freq}
                    variant={preferences.frequency === freq ? "default" : "outline"}
                    size="sm"
                    onClick={() => updatePreferences({ frequency: freq })}
                    disabled={isSaving}
                    className="flex-1"
                  >
                    {freq === 'low' && 'Low'}
                    {freq === 'normal' && 'Normal'}
                    {freq === 'high' && 'High'}
                    {preferences.frequency === freq && (
                      <Check className="h-3 w-3 ml-1" />
                    )}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {preferences.frequency === 'low' && 'Only important insights'}
                {preferences.frequency === 'normal' && 'Balanced notifications'}
                {preferences.frequency === 'high' && 'All insights and suggestions'}
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm">Test Notifications</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sendTestNotification(false)}
                  disabled={isSendingTest}
                  className="flex-1"
                >
                  <Send className="h-3 w-3 mr-2" />
                  Send Basic Test
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sendTestNotification(true)}
                  disabled={isSendingTest}
                  className="flex-1"
                >
                  <Send className="h-3 w-3 mr-2" />
                  Send Rich Test
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Rich notifications include action buttons you can tap directly from the notification
              </p>
            </div>
          </>
        )}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Push notifications are sent from the /chat page. Make sure you've granted notification
            permissions when visiting{' '}
            <a href="/chat" className="underline">
              /chat
            </a>
            .
          </AlertDescription>
        </Alert>

        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
            {message.type === 'success' ? (
              <Check className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
