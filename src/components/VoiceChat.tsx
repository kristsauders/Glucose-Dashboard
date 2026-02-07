import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2, Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

interface VoiceChatProps {
  conversationId?: string;
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
}

export function VoiceChat({ conversationId, onTranscript, onResponse }: VoiceChatProps) {
  const [mode, setMode] = useState<'idle' | 'recording' | 'processing' | 'playing'>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const recorder = useAudioRecorder({
    onDataAvailable: handleAudioRecorded,
    onError: (err) => setError(err.message)
  });

  // Auto-play response audio when available
  useEffect(() => {
    if (audioUrl && !isMuted && audioRef.current && mode === 'playing') {
      // Attempt auto-play
      const playPromise = audioRef.current.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // Autoplay started successfully
            setIsPlaying(true);
          })
          .catch((err) => {
            // Autoplay was prevented
            console.log('Autoplay prevented:', err.name);
            setIsPlaying(false);

            // If audio hasn't been unlocked yet, show a hint
            if (!audioUnlocked) {
              setError('Tap the play button to hear the response (first time only)');
            }
          });
      }
    }
  }, [audioUrl, isMuted, mode, audioUnlocked]);

  async function handleAudioRecorded(blob: Blob) {
    try {
      setMode('processing');
      setError('');
      setTranscript('');
      setResponse('');
      setAudioUrl(null);

      // Upload audio and get response
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      formData.append('voice', 'nova'); // Default voice
      if (conversationId) {
        formData.append('conversationId', conversationId);
      }

      const token = localStorage.getItem('t1d_auth_token');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';

      const response = await fetch(`${apiUrl}/api/voice/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to process voice' }));
        throw new Error(errorData.error || 'Failed to process voice');
      }

      const data = await response.json();

      setTranscript(data.transcript);
      setResponse(data.response);

      // Convert base64 audio to blob URL
      if (data.audio) {
        const audioBlob = base64ToBlob(data.audio, 'audio/mpeg');
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      }

      setMode('playing');

      // Callbacks
      if (onTranscript) onTranscript(data.transcript);
      if (onResponse) onResponse(data.response);

    } catch (err: any) {
      console.error('Voice chat error:', err);
      setError(err.message || 'Failed to process voice');
      setMode('idle');
    }
  }

  function base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function handleMicButtonDown() {
    if (mode === 'idle') {
      // Unlock audio playback using this user gesture
      if (!audioUnlocked) {
        try {
          // Create a silent audio element and play it to unlock audio
          const silentAudio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAA4SC3RqvAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV');
          silentAudio.play().then(() => {
            setAudioUnlocked(true);
            console.log('Audio unlocked successfully');
          }).catch((err) => {
            console.log('Audio unlock failed:', err);
          });
        } catch (err) {
          console.log('Audio unlock error:', err);
        }
      }

      recorder.startRecording();
      setMode('recording');
      setError('');
    }
  }

  function handleMicButtonUp() {
    if (mode === 'recording') {
      recorder.stopRecording();
    }
  }

  function handleCancelRecording() {
    recorder.cancelRecording();
    setMode('idle');
    setError('');
  }

  function handleToggleMute() {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
  }

  function handlePlayPause() {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().then(() => {
          // Mark audio as unlocked after first manual play
          setAudioUnlocked(true);
        }).catch((err) => {
          console.error('Play failed:', err);
        });
      }
      setIsPlaying(!isPlaying);
    }
  }

  if (!recorder.isSupported) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Voice recording is not supported in your browser. Please use Chrome, Safari, or Firefox.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* iOS Permission Info */}
      {mode === 'idle' && !transcript && !audioUnlocked && (
        <Alert>
          <AlertDescription className="text-xs">
            <strong>Tip:</strong> You'll need to grant microphone permission when prompted.
            {/iPad|iPhone|iPod/.test(navigator.userAgent) &&
              " On iOS, you may need to grant permission each time you open the app."}
            {" "}Responses will play automatically after your first recording.
          </AlertDescription>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Voice Interface */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center space-y-6">
            {/* Microphone Button */}
            <div className="relative">
              <Button
                size="lg"
                variant={mode === 'recording' ? 'destructive' : 'default'}
                className={`h-32 w-32 rounded-full transition-all ${
                  mode === 'recording' ? 'scale-110 animate-pulse' : ''
                }`}
                onMouseDown={handleMicButtonDown}
                onMouseUp={handleMicButtonUp}
                onTouchStart={handleMicButtonDown}
                onTouchEnd={handleMicButtonUp}
                disabled={mode === 'processing' || mode === 'playing'}
              >
                {mode === 'recording' ? (
                  <Mic className="h-16 w-16" />
                ) : mode === 'processing' ? (
                  <Loader2 className="h-16 w-16 animate-spin" />
                ) : (
                  <MicOff className="h-16 w-16" />
                )}
              </Button>

              {/* Recording Timer */}
              {mode === 'recording' && (
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-sm font-mono text-muted-foreground">
                  {formatTime(recorder.recordingTime)}
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="text-center text-sm text-muted-foreground max-w-md">
              {mode === 'idle' && (
                <p>Press and hold the microphone to speak</p>
              )}
              {mode === 'recording' && (
                <p>Speaking... Release to send</p>
              )}
              {mode === 'processing' && (
                <p>Processing your message...</p>
              )}
              {mode === 'playing' && (
                <p>Sage is responding</p>
              )}
            </div>

            {/* Cancel Recording Button */}
            {mode === 'recording' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelRecording}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transcript Display */}
      {transcript && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase">
                You said:
              </div>
              <p className="text-sm">{transcript}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Response Display */}
      {response && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-muted-foreground uppercase">
                  Sage says:
                </div>
                <div className="flex items-center gap-2">
                  {audioUrl && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handlePlayPause}
                        className="h-8 w-8 p-0"
                      >
                        {isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleToggleMute}
                        className="h-8 w-8 p-0"
                      >
                        {isMuted ? (
                          <VolumeX className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <p className="text-sm">{response}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hidden audio element for playback */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setMode('idle');
          }}
          muted={isMuted}
        />
      )}
    </div>
  );
}
