import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, Watch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const TOKEN_KEY = 't1d_auth_token';
const API_URL = import.meta.env.VITE_API_URL || 'https://your-server.com';
// Plain HTTP URL for Apple Watch shortcuts (watchOS can't trust self-signed CAs)
const HTTP_API_URL = import.meta.env.VITE_HTTP_API_URL || API_URL;

export function VoiceQuerySettings() {
  const [tokenCopied, setTokenCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [watchUrlCopied, setWatchUrlCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const copyToken = () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    navigator.clipboard.writeText(token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2500);
  };

  const copyEndpointUrl = () => {
    navigator.clipboard.writeText(`${API_URL}/api/voice/query`);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2500);
  };

  const copyWatchUrl = () => {
    navigator.clipboard.writeText(`${HTTP_API_URL}/api/voice/query`);
    setWatchUrlCopied(true);
    setTimeout(() => setWatchUrlCopied(false), 2500);
  };

  const hasToken = !!localStorage.getItem(TOKEN_KEY);
  const hasSeperateHttpUrl = HTTP_API_URL !== API_URL;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Watch className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Siri & Apple Watch</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Ask Sage questions and log insulin, meals, and exercise by voice — via Siri or Apple Watch.
            </p>
          </div>
        </div>

        {/* Token + URL copy buttons */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">For Shortcut setup</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyToken}
              disabled={!hasToken}
              className="flex-1"
            >
              {tokenCopied ? (
                <><Check className="h-3 w-3 mr-2" />Copied!</>
              ) : (
                <><Copy className="h-3 w-3 mr-2" />Copy Auth Token</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyEndpointUrl}
              className="flex-1"
            >
              {urlCopied ? (
                <><Check className="h-3 w-3 mr-2" />Copied!</>
              ) : (
                <><Copy className="h-3 w-3 mr-2" />Copy URL (iPhone)</>
              )}
            </Button>
          </div>
          {hasSeperateHttpUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={copyWatchUrl}
              className="w-full"
            >
              {watchUrlCopied ? (
                <><Check className="h-3 w-3 mr-2" />Copied!</>
              ) : (
                <><Copy className="h-3 w-3 mr-2" />Copy URL (Apple Watch — HTTP)</>
              )}
            </Button>
          )}
          {!hasToken && (
            <p className="text-xs text-destructive">Not signed in — token unavailable.</p>
          )}
        </div>

        {/* Collapsible setup guide */}
        <div className="border rounded-md">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 transition-colors"
            onClick={() => setShowGuide(v => !v)}
          >
            <span>Shortcut Setup Guide</span>
            {showGuide ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showGuide && (
            <div className="px-3 pb-3 space-y-4 text-xs text-muted-foreground border-t pt-3">
              <Alert>
                <AlertDescription className="text-xs">
                  One shortcut handles everything — questions and logging both go to the same endpoint.
                  Sage figures out intent from what you say. Works from iPhone, AirPods, and Apple Watch.
                </AlertDescription>
              </Alert>

              {/* One-time prep */}
              <div>
                <p className="font-semibold text-foreground mb-1">Before you start (once)</p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Tap <strong>Copy Auth Token</strong> above and save it somewhere (Notes, etc.)</li>
                  <li>Tap the appropriate URL button above:
                    <ul className="list-disc list-inside pl-4 mt-0.5 space-y-0.5">
                      <li><strong>iPhone / Siri / AirPods</strong> → Copy URL (iPhone)</li>
                      <li><strong>Apple Watch</strong> → Copy URL (Apple Watch — HTTP)</li>
                    </ul>
                  </li>
                </ol>
              </div>

              {/* Single shortcut */}
              <div>
                <p className="font-semibold text-foreground mb-1">Create the "Sage" Shortcut</p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Open the <strong>Shortcuts</strong> app → tap <strong>+</strong></li>
                  <li>Name it <strong>Sage</strong></li>
                  <li>Add action: <strong>Ask for Input</strong>
                    <ul className="list-disc list-inside pl-4 mt-0.5 space-y-0.5">
                      <li>Input Type: <strong>Text</strong></li>
                      <li>Prompt: <em>Ask or log something</em></li>
                      <li>Toggle <strong>Allow Speech</strong> on</li>
                    </ul>
                  </li>
                  <li>Add action: <strong>Get Contents of URL</strong>
                    <ul className="list-disc list-inside pl-4 mt-0.5 space-y-0.5">
                      <li>URL: paste the endpoint URL you copied</li>
                      <li>Method: <strong>POST</strong></li>
                      <li>Headers: add <code>Authorization</code> → <code>Bearer YOUR_TOKEN</code></li>
                      <li>Headers: add <code>Content-Type</code> → <code>application/json</code></li>
                      <li>Request Body: <strong>JSON</strong></li>
                      <li>Add key <code>message</code> → value: <em>Provided Input</em> variable</li>
                    </ul>
                  </li>
                  <li>Add action: <strong>Get Dictionary Value</strong>
                    <ul className="list-disc list-inside pl-4 mt-0.5 space-y-0.5">
                      <li>Get: <strong>Value</strong> for key <code>spoken</code></li>
                      <li>from: <em>Contents of URL</em></li>
                    </ul>
                  </li>
                  <li>Add action: <strong>Speak Text</strong> → input: <em>Dictionary Value</em></li>
                  <li>Tap the shortcut name → <strong>Add to Home Screen</strong> or pin as a Watch complication</li>
                </ol>
                <p className="mt-2 italic">Examples: "What's my glucose trend?" · "4 units Humalog, meal bolus" · "Log a 30-minute run, moderate intensity"</p>
              </div>

              {/* Multi-turn tip */}
              <div>
                <p className="font-semibold text-foreground mb-1">Optional: multi-turn follow-up questions</p>
                <p>After the <em>Get Contents of URL</em> step, add:</p>
                <ol className="list-decimal list-inside pl-1 space-y-0.5">
                  <li>Add action: <strong>Get Dictionary Value</strong> — key <code>conversationId</code></li>
                  <li>Add action: <strong>Set Variable</strong> → name: <em>ConversationId</em></li>
                  <li>In the POST body, also add key <code>conversationId</code> → <em>ConversationId</em> variable</li>
                </ol>
                <p className="mt-1">Now follow-up questions within the same Shortcut session remember the previous exchange.</p>
              </div>

              {/* Siri trigger */}
              <div>
                <p className="font-semibold text-foreground mb-1">Triggering via Siri</p>
                <ul className="list-disc list-inside pl-1 space-y-0.5">
                  <li>Say: <em>"Hey Siri, Sage"</em> — Siri runs the shortcut and prompts for your question</li>
                  <li>Works from iPhone, AirPods, and Apple Watch</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
