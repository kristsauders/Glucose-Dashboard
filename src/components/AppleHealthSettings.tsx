import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check
} from 'lucide-react';
import { apiService } from '@/services/api';
import { formatDistanceToNow } from 'date-fns';

export function AppleHealthSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [lastWorkout, setLastWorkout] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setIsLoading(true);
    try {
      const status = await apiService.getAppleHealthStatus();
      setIsConnected(status.connected);
      setTotalWorkouts(status.totalWorkouts || 0);
      setLastWorkout(status.lastWorkout || null);
    } catch (err) {
      console.error('Failed to check Apple Health status:', err);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyToken = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await navigator.clipboard.writeText(token);
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy token:', err);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Apple Health
          </CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Apple Health
            </CardTitle>
            <CardDescription>
              Automatically sync workouts from Apple Watch
            </CardDescription>
          </div>
          {isConnected ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <XCircle className="h-3 w-3" />
              Not Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Workouts</p>
                <p className="text-2xl font-semibold">{totalWorkouts}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Synced</p>
                <p className="text-sm font-medium">
                  {lastWorkout
                    ? formatDistanceToNow(new Date(lastWorkout), { addSuffix: true })
                    : 'Never'}
                </p>
              </div>
            </div>

            <Alert>
              <Activity className="h-4 w-4" />
              <AlertDescription>
                Workouts are automatically synced every 2 hours via iOS Shortcuts automation.
              </AlertDescription>
            </Alert>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInstructions(!showInstructions)}
              className="w-full"
            >
              {showInstructions ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
              {showInstructions ? 'Hide' : 'View'} Setup Instructions
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <Activity className="h-4 w-4" />
              <AlertDescription>
                Connect Apple Health to automatically import workout data from your Apple Watch.
                This helps Sage analyze how exercise affects your glucose levels.
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => setShowInstructions(!showInstructions)}
              className="w-full"
            >
              <Activity className="h-4 w-4 mr-2" />
              Setup Apple Health Sync
            </Button>
          </div>
        )}

        {showInstructions && (
          <div className="space-y-4 pt-4 border-t">
            <div>
              <h4 className="font-semibold text-sm mb-2">Setup Instructions</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Follow these steps to enable automatic workout syncing from Apple Health:
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  1
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">Copy your authentication token</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyToken}
                    className="w-full"
                  >
                    {copiedToken ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Token
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  2
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-2">Create the Sage Health Sync shortcut</p>
                  <p className="text-sm text-muted-foreground">
                    Open the <strong>Shortcuts</strong> app on your iPhone and tap the <strong>+</strong> button to create a new shortcut.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  3
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1">Configure the shortcut</p>
                  <p className="text-sm text-muted-foreground">
                    Add actions to query Health workouts, extract details, and POST to{' '}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {window.location.origin}/api/apple-health/workouts
                    </code>{' '}
                    with your token. See detailed guide for step-by-step instructions.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  4
                </div>
                <div className="flex-1">
                  <p className="text-sm">
                    Grant permissions to access Workout data when prompted by iOS
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  5
                </div>
                <div className="flex-1">
                  <p className="text-sm">
                    Test the shortcut by tapping "Run" - workouts should appear in your exercise log
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  6
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1">Enable automation</p>
                  <p className="text-sm text-muted-foreground">
                    Go to Automations tab → Create Time of Day automation → Run every 2 hours → Turn off "Ask Before Running"
                  </p>
                </div>
              </div>
            </div>

            <Alert>
              <Activity className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Need detailed instructions?</strong> The full setup guide with screenshots and troubleshooting
                is available in the repository at <code>docs/APPLE_HEALTH_SETUP.md</code>.
                The shortcut configuration requires several specific actions to query Health data, format it as JSON,
                and POST to the API with authentication.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
