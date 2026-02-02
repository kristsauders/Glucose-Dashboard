import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Settings, Wifi, WifiOff } from 'lucide-react';
import { libreViewService, type LibreViewCredentials } from '@/services/libreview';

interface LibreViewSettingsProps {
  onConnectionChange?: (connected: boolean) => void;
}

export function LibreViewSettings({ onConnectionChange }: LibreViewSettingsProps) {
  const [credentials, setCredentials] = useState<LibreViewCredentials>({
    email: '',
    password: '',
    region: 'us',
  });
  const [corsProxy] = useState<string>(() => {
    // Use current hostname so it works from any device on the network
    const hostname = window.location.hostname;
    return `http://${hostname}:3001/proxy?url=`;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Load stored credentials
    const stored = libreViewService.getStoredCredentials();
    if (stored) {
      setCredentials(stored);
      setIsConnected(libreViewService.isAuthenticated());
    }
  }, []);

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Save credentials and proxy
      libreViewService.saveCredentials(credentials, corsProxy);

      // Attempt login with proxy
      const success = await libreViewService.login(credentials, corsProxy);

      if (success) {
        setIsConnected(true);
        setShowSettings(false);
        onConnectionChange?.(true);
      } else {
        setError('Login failed. Please check your credentials.');
        setIsConnected(false);
        onConnectionChange?.(false);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      setIsConnected(false);
      onConnectionChange?.(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    libreViewService.clearCredentials();
    setIsConnected(false);
    setCredentials({ email: '', password: '', region: 'us' });
    onConnectionChange?.(false);
  };

  const handleTestConnection = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const authenticated = await libreViewService.ensureAuthenticated();
      setIsConnected(authenticated);

      if (!authenticated) {
        setError('Not connected. Please enter your credentials.');
      }

      onConnectionChange?.(authenticated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
      setIsConnected(false);
      onConnectionChange?.(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (!showSettings && isConnected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="bg-[hsl(var(--chart-2))]/10 border-[hsl(var(--chart-2))]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[hsl(var(--chart-2))]/20">
                  <Wifi className="h-5 w-5 text-[hsl(var(--chart-2))]" />
                </div>
                <div>
                  <p className="font-semibold text-sm">LibreView Connected</p>
                  <p className="text-xs text-muted-foreground">
                    Auto-updating every minute
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={isLoading}
                >
                  Test
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-5 w-5" />
                LibreView Connection
              </CardTitle>
              <CardDescription>
                Connect to LibreView to enable live glucose monitoring
              </CardDescription>
            </div>
            {isConnected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(false)}
              >
                Close
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">LibreView Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={credentials.email}
                onChange={(e) =>
                  setCredentials({ ...credentials, email: e.target.value })
                }
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">LibreView Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={credentials.password}
                onChange={(e) =>
                  setCredentials({ ...credentials, password: e.target.value })
                }
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && credentials.email && credentials.password) {
                    handleConnect();
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <select
                id="region"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={credentials.region}
                onChange={(e) =>
                  setCredentials({
                    ...credentials,
                    region: e.target.value as LibreViewCredentials['region'],
                  })
                }
                disabled={isLoading}
              >
                <option value="us">United States</option>
                <option value="eu">Europe</option>
                <option value="de">Germany</option>
                <option value="fr">France</option>
                <option value="jp">Japan</option>
                <option value="ap">Asia-Pacific</option>
                <option value="au">Australia</option>
                <option value="ae">Middle East</option>
                <option value="ca">Canada</option>
              </select>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <div className="flex gap-2">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {isConnected && !error && (
            <div className="bg-[hsl(var(--chart-2))]/10 border border-[hsl(var(--chart-2))]/20 rounded-lg p-3">
              <div className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--chart-2))] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[hsl(var(--chart-2))]">
                  Successfully connected to LibreView!
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            {isConnected ? (
              <>
                <Button
                  onClick={handleDisconnect}
                  variant="destructive"
                  disabled={isLoading}
                  className="flex-1"
                >
                  <WifiOff className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
                <Button
                  onClick={handleTestConnection}
                  variant="outline"
                  disabled={isLoading}
                >
                  Test Connection
                </Button>
              </>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={
                  isLoading || !credentials.email || !credentials.password
                }
                className="w-full"
              >
                <Wifi className="h-4 w-4 mr-2" />
                {isLoading ? 'Connecting...' : 'Connect to LibreView'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
