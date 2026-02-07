import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Mic, Check, AlertCircle, ExternalLink } from 'lucide-react';

const VOICES = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral, balanced' },
  { id: 'echo', name: 'Echo', description: 'Male, clear' },
  { id: 'fable', name: 'Fable', description: 'Male, expressive' },
  { id: 'onyx', name: 'Onyx', description: 'Male, deep' },
  { id: 'nova', name: 'Nova', description: 'Female, warm (recommended)' },
  { id: 'shimmer', name: 'Shimmer', description: 'Female, soft' }
];

export function VoiceSettings() {
  const [selectedVoice, setSelectedVoice] = useState('nova');
  const [autoPlay, setAutoPlay] = useState(true);
  const [showTranscript, setShowTranscript] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  function loadSettings() {
    const settings = localStorage.getItem('voice_settings');
    if (settings) {
      try {
        const parsed = JSON.parse(settings);
        setSelectedVoice(parsed.voice || 'nova');
        setAutoPlay(parsed.autoPlay !== undefined ? parsed.autoPlay : true);
        setShowTranscript(parsed.showTranscript !== undefined ? parsed.showTranscript : true);
      } catch (error) {
        console.error('Failed to load voice settings:', error);
      }
    }
  }

  function saveSettings() {
    setIsSaving(true);
    setMessage(null);

    try {
      const settings = {
        voice: selectedVoice,
        autoPlay,
        showTranscript
      };
      localStorage.setItem('voice_settings', JSON.stringify(settings));
      setMessage({ type: 'success', text: 'Voice settings saved' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save voice settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        {/* Voice Selection */}
        <div className="space-y-3">
          <Label className="text-base">Voice</Label>
          <CardDescription className="text-xs">
            Choose the voice for Sage's audio responses
          </CardDescription>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {VOICES.map((voice) => (
              <Button
                key={voice.id}
                variant={selectedVoice === voice.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedVoice(voice.id)}
                className="flex-col h-auto py-3"
              >
                <span className="font-medium">{voice.name}</span>
                <span className="text-xs text-muted-foreground">
                  {voice.description}
                </span>
                {selectedVoice === voice.id && (
                  <Check className="h-3 w-3 mt-1" />
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Auto-play Toggle */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Label className="text-base">Auto-play Responses</Label>
            <CardDescription className="text-xs">
              Automatically play audio responses after transcription
            </CardDescription>
          </div>
          <Button
            variant={autoPlay ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoPlay(!autoPlay)}
            disabled={isSaving}
          >
            {autoPlay ? "On" : "Off"}
          </Button>
        </div>

        {/* Show Transcript Toggle */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Label className="text-base">Show Transcript</Label>
            <CardDescription className="text-xs">
              Display text alongside audio for verification
            </CardDescription>
          </div>
          <Button
            variant={showTranscript ? "default" : "outline"}
            size="sm"
            onClick={() => setShowTranscript(!showTranscript)}
            disabled={isSaving}
          >
            {showTranscript ? "On" : "Off"}
          </Button>
        </div>

        {/* Save Button */}
        <Button
          onClick={saveSettings}
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>

        {/* Quick Access Info */}
        <Alert>
          <Mic className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Quick Access:</strong> Visit{' '}
            <a href="/voice" className="underline inline-flex items-center gap-1">
              /voice
              <ExternalLink className="h-3 w-3" />
            </a>{' '}
            for the voice-optimized interface. Bookmark it or add to home screen for instant access.
          </AlertDescription>
        </Alert>

        {/* Status Message */}
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
