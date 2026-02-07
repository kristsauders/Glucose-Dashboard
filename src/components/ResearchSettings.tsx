import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FlaskConical, FlaskConicalOff, Check, AlertCircle, Info } from 'lucide-react';

const TOKEN_KEY = 't1d_auth_token';

export function ResearchSettings() {
  const [preferences, setPreferences] = useState({
    enabled: true,
    max_papers_per_week: 2,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return;

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/settings/research-preferences`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
      }
    } catch (error) {
      console.error('Failed to fetch research preferences:', error);
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

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/settings/research-preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        setPreferences(prev => ({ ...prev, ...updates }));
        setMessage({ type: 'success', text: 'Research preferences updated successfully' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error('Failed to update research preferences');
      }
    } catch (error) {
      console.error('Failed to update research preferences:', error);
      setMessage({ type: 'error', text: 'Failed to update research preferences' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">Loading research preferences...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Label className="text-base">Research Assistant</Label>
            <CardDescription>
              Get personalized research discoveries from PubMed tailored to your patterns
            </CardDescription>
          </div>
          <Button
            variant={preferences.enabled ? "default" : "outline"}
            size="sm"
            onClick={() => updatePreferences({ enabled: !preferences.enabled })}
            disabled={isSaving}
          >
            {preferences.enabled ? (
              <>
                <FlaskConical className="h-4 w-4 mr-2" />
                Enabled
              </>
            ) : (
              <>
                <FlaskConicalOff className="h-4 w-4 mr-2" />
                Disabled
              </>
            )}
          </Button>
        </div>

        {preferences.enabled && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm">Max Papers Per Week</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((num) => (
                  <Button
                    key={num}
                    variant={preferences.max_papers_per_week === num ? "default" : "outline"}
                    size="sm"
                    onClick={() => updatePreferences({ max_papers_per_week: num })}
                    disabled={isSaving}
                    className="flex-1"
                  >
                    {num}
                    {preferences.max_papers_per_week === num && (
                      <Check className="h-3 w-3 ml-1" />
                    )}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Sage will share up to {preferences.max_papers_per_week} relevant research{' '}
                {preferences.max_papers_per_week === 1 ? 'paper' : 'papers'} per week
              </p>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>How it works:</strong> Every 2-3 days, Sage searches PubMed for new diabetes research,
                analyzes relevance based on your glucose patterns and challenges, and proactively shares
                findings that could help you. You can also request research on specific topics anytime.
              </AlertDescription>
            </Alert>
          </div>
        )}

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
