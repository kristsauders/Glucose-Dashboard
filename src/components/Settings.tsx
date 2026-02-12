import { motion } from 'framer-motion';
import { X, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LibreViewSettings } from './LibreViewSettings';
import { AppleHealthSettings } from './AppleHealthSettings';
import { DiscordSettings } from './DiscordSettings';
import { NotificationSettings } from './NotificationSettings';
import { VoiceSettings } from './VoiceSettings';
import { ResearchSettings } from './ResearchSettings';

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl m-4 my-8"
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="h-5 w-5" />
                  Settings
                </CardTitle>
                <CardDescription>
                  Manage your connections and preferences
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-3">Data Sources</h3>
              <div className="space-y-4">
                <LibreViewSettings />
                <AppleHealthSettings />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Notifications</h3>
              <NotificationSettings />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Voice Mode</h3>
              <VoiceSettings />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Research</h3>
              <ResearchSettings />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Integrations</h3>
              <DiscordSettings />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
