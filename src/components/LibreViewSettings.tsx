import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Settings, Wifi, WifiOff } from 'lucide-react';
import { apiService } from '@/services/api';

interface LibreViewSettingsProps {
  onConnectionChange?: (connected: boolean) => void;
}

export function LibreViewSettings({ onConnectionChange }: LibreViewSettingsProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string>('');
  const [lastSync, setLastSync] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const status = await apiService.getLibreViewStatus();
      setIsConnected(status.isConnected);
      if (status.isConnected) {
        setConnectedEmail(status.email || '');
        setLastSync(status.lastSync || '');
        onConnectionChange?.(true);
      }
    } catch (err) {
      console.error('Failed to check LibreView status:', err);
      setIsConnected(false);
      onConnectionChange?.(false);
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await apiService.connectLibreView(email, password);
      await checkConnectionStatus();
      setShowSettings(false);
      setPassword(''); // Clear password after successful connection
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      setIsConnected(false);
      onConnectionChange?.(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await apiService.disconnectLibreView();
      setIsConnected(false);
      setConnectedEmail('');
      setLastSync('');
      setEmail('');
      setPassword('');
      onConnectionChange?.(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
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
                    {connectedEmail}
                    {lastSync && ` • Last sync: ${new Date(lastSync).toLocaleString()}`}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(true)}
              >
                <Settings className="h-4 w-4" />
              </Button>
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
                Connect to LibreView for automatic data syncing
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">LibreView Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && email && password) {
                    handleConnect();
                  }
                }}
              />
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
                  Successfully connected to LibreView! Data will sync automatically in the background.
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            {isConnected ? (
              <Button
                onClick={handleDisconnect}
                variant="destructive"
                disabled={isLoading}
                className="w-full"
              >
                <WifiOff className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={isLoading || !email || !password}
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
