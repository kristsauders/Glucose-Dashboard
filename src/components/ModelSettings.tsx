import { useState, useEffect } from 'react';
import { Save, Loader2, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { apiService } from '@/services/api';

interface ModelConfig {
  chat: {
    smallModel: string;
    largeModel: string;
  };
  proactive: {
    smallModel: string;
    largeModel: string;
  };
}

export function ModelSettings() {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load current configuration
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getModelConfig();
      setConfig(response);
    } catch (err: any) {
      setError(err.message || 'Failed to load model configuration');
      console.error('Failed to load model config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      await apiService.updateModelConfig(config);

      setSuccessMessage('Model configuration saved! Changes will apply to new conversations.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to save model configuration');
      console.error('Failed to save model config:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (
    category: 'chat' | 'proactive',
    field: 'smallModel' | 'largeModel',
    value: string
  ) => {
    if (!config) return;
    setConfig({
      ...config,
      [category]: {
        ...config[category],
        [field]: value,
      },
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">
            Failed to load model configuration
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-6">
          {/* Chat Models */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Brain className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">Chat Models</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Models used for interactive chat conversations
            </p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="chat-small-model">Small Model (Tool Calling)</Label>
                <Input
                  id="chat-small-model"
                  value={config.chat.smallModel}
                  onChange={(e) => handleInputChange('chat', 'smallModel', e.target.value)}
                  placeholder="e.g., qwen2.5:32b or google/gemini-2.0-flash-thinking-exp:free"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used for tool calling and data retrieval (cost-optimized)
                </p>
              </div>
              <div>
                <Label htmlFor="chat-large-model">Large Model (Response Synthesis)</Label>
                <Input
                  id="chat-large-model"
                  value={config.chat.largeModel}
                  onChange={(e) => handleInputChange('chat', 'largeModel', e.target.value)}
                  placeholder="e.g., anthropic/claude-sonnet-4.5"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used for generating final responses (high quality)
                </p>
              </div>
            </div>
          </div>

          {/* Proactive Models */}
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">Proactive Models</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Models used for proactive background analysis
            </p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="proactive-small-model">Small Model (Tool Calling)</Label>
                <Input
                  id="proactive-small-model"
                  value={config.proactive.smallModel}
                  onChange={(e) => handleInputChange('proactive', 'smallModel', e.target.value)}
                  placeholder="e.g., qwen2.5:32b or google/gemini-2.0-flash-thinking-exp:free"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used for pattern detection and analysis
                </p>
              </div>
              <div>
                <Label htmlFor="proactive-large-model">Large Model (Message Synthesis)</Label>
                <Input
                  id="proactive-large-model"
                  value={config.proactive.largeModel}
                  onChange={(e) => handleInputChange('proactive', 'largeModel', e.target.value)}
                  placeholder="e.g., anthropic/claude-sonnet-4.5"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used for generating proactive messages
                </p>
              </div>
            </div>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          {successMessage && (
            <div className="rounded-md bg-green-500/10 p-3">
              <p className="text-sm text-green-600 dark:text-green-400">{successMessage}</p>
            </div>
          )}

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Configuration
              </>
            )}
          </Button>

          {/* Model Name Format Help */}
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Model Format:</strong> For OpenRouter models, use the format shown in their{' '}
              <a
                href="https://openrouter.ai/models"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                model list
              </a>
              {' '}(e.g., anthropic/claude-sonnet-4.5, google/gemini-2.0-flash-thinking-exp:free).
              For Ollama models, use the model name (e.g., qwen2.5:32b, llama3.3:70b).
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
