import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Settings, MessageCircle, Link2Off } from 'lucide-react';
import { apiService } from '@/services/api';

export function DiscordSettings() {
  const [discordUserId, setDiscordUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLinked, setIsLinked] = useState(false);
  const [linkedUserId, setLinkedUserId] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    checkLinkStatus();
  }, []);

  const checkLinkStatus = async () => {
    try {
      const settings = await apiService.getSettings();
      setIsLinked(settings.settings.discord.linked);
      if (settings.settings.discord.linked) {
        setLinkedUserId(settings.settings.discord.userId || '');
      }
    } catch (err) {
      console.error('Failed to check Discord link status:', err);
      setIsLinked(false);
    }
  };

  const handleLink = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await apiService.linkDiscord(discordUserId);
      await checkLinkStatus();
      setShowSettings(false);
      setDiscordUserId(''); // Clear input after successful link
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Link failed';
      setError(errorMessage);
      setIsLinked(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnlink = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await apiService.unlinkDiscord();
      setIsLinked(false);
      setLinkedUserId('');
      setDiscordUserId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlink failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!showSettings && isLinked) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="bg-[hsl(var(--chart-4))]/10 border-[hsl(var(--chart-4))]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[hsl(var(--chart-4))]/20">
                  <MessageCircle className="h-5 w-5 text-[hsl(var(--chart-4))]" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Discord Linked</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {linkedUserId}
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
                <MessageCircle className="h-5 w-5" />
                Discord Integration
              </CardTitle>
              <CardDescription>
                Link your Discord account to chat with Sage
              </CardDescription>
            </div>
            {isLinked && (
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
          {/* Instructions */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">How to get your Discord User ID:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Enable Developer Mode in Discord (Settings → Advanced → Developer Mode)</li>
              <li>Right-click your username</li>
              <li>Click "Copy User ID"</li>
            </ol>
          </div>

          {/* Link Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="discordUserId">Discord User ID</Label>
              <Input
                id="discordUserId"
                type="text"
                placeholder="123456789012345678"
                value={discordUserId}
                onChange={(e) => setDiscordUserId(e.target.value)}
                disabled={isLoading}
                className="font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && discordUserId) {
                    handleLink();
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
          {isLinked && !error && (
            <div className="bg-[hsl(var(--chart-4))]/10 border border-[hsl(var(--chart-4))]/20 rounded-lg p-3">
              <div className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--chart-4))] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-[hsl(var(--chart-4))] space-y-1">
                  <p className="font-medium">Discord account linked successfully!</p>
                  <p>You can now chat with Sage via Discord:</p>
                  <ul className="list-disc list-inside pl-2 space-y-0.5">
                    <li>Send a DM to the Sage bot</li>
                    <li>Or @mention the bot in any channel</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            {isLinked ? (
              <Button
                onClick={handleUnlink}
                variant="destructive"
                disabled={isLoading}
                className="w-full"
              >
                <Link2Off className="h-4 w-4 mr-2" />
                Unlink Discord
              </Button>
            ) : (
              <Button
                onClick={handleLink}
                disabled={isLoading || !discordUserId}
                className="w-full"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                {isLoading ? 'Linking...' : 'Link Discord Account'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
