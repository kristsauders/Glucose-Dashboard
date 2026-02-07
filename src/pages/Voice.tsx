import { useState, useEffect } from 'react';
import { VoiceChat } from '../components/VoiceChat';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Mic, MessageSquare, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '@/services/api';

/**
 * Voice-optimized page for hands-free interaction with Sage
 * Accessible via /voice route
 * Designed for quick access from iOS Shortcuts, Android Quick Settings, etc.
 */
export function Voice() {
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [recentMessages, setRecentMessages] = useState<Array<{ role: string; content: string }>>([]);

  // Create or get conversation on mount
  useEffect(() => {
    createVoiceConversation();
  }, []);

  async function createVoiceConversation() {
    try {
      // Create a new "Voice Session" conversation
      const conversation = await apiService.createConversation();
      setConversationId(conversation.id);
    } catch (error) {
      console.error('Failed to create voice conversation:', error);
    }
  }

  function handleTranscript(text: string) {
    setRecentMessages(prev => [...prev, { role: 'user', content: text }]);
  }

  function handleResponse(text: string) {
    setRecentMessages(prev => [...prev, { role: 'assistant', content: text }]);
  }

  function handleGoToChat() {
    if (conversationId) {
      navigate(`/chat?conversation=${conversationId}`);
    } else {
      navigate('/chat');
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Voice Mode</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGoToChat}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
            >
              <Home className="h-4 w-4 mr-2" />
              Dashboard
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 max-w-2xl">
        <VoiceChat
          conversationId={conversationId || undefined}
          onTranscript={handleTranscript}
          onResponse={handleResponse}
        />

        {/* Recent Messages Preview (optional) */}
        {recentMessages.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-sm">Conversation History</CardTitle>
              <CardDescription className="text-xs">
                Recent messages from this session
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {recentMessages.slice(-5).map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground ml-8'
                        : 'bg-muted mr-8'
                    }`}
                  >
                    {msg.content}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions Card */}
        <Card className="mt-6 border-dashed">
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground space-y-2">
              <p className="font-semibold">Quick Access Tips:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>iOS:</strong> Create Siri Shortcut → "Open URL" → {window.location.origin}/voice</li>
                <li><strong>iPhone 15 Pro+:</strong> Map to Action Button for instant access</li>
                <li><strong>Android:</strong> Add home screen shortcut with voice parameter</li>
                <li><strong>Any device:</strong> Bookmark this page for quick logging</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card">
        <div className="container mx-auto px-4 py-3 text-center text-xs text-muted-foreground">
          Press and hold microphone • Speak naturally • Release to send
        </div>
      </footer>
    </div>
  );
}
