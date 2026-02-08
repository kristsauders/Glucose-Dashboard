import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { env } from '../config/env.js';

export interface AIProvider {
  model: any;
  name: string;
}

export interface HybridAIProvider {
  smallModel: any;
  largeModel: any;
  smallModelName: string;
  largeModelName: string;
}

export function getAIProvider(forceProvider?: 'ollama' | 'openrouter'): AIProvider {
  const provider = forceProvider || env.AI_PROVIDER;

  if (provider === 'ollama') {
    return {
      name: 'ollama',
      model: new ChatOllama({
        baseUrl: env.OLLAMA_BASE_URL,
        model: env.OLLAMA_MODEL,
        temperature: 0.7,
        streaming: true,
        numCtx: 32768, // Context window: 32k tokens
      }),
    };
  } else {
    // OpenRouter
    const model = new ChatOpenAI({
      modelName: env.OPENROUTER_MODEL,
      apiKey: env.OPENROUTER_API_KEY, // Changed from openAIApiKey to apiKey in newer versions
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://t1d-dashboard.local',
          'X-Title': 'T1D AI Assistant',
        },
      },
      temperature: 0.7,
      streaming: true, // Enable streaming
      maxTokens: 4096, // Set max tokens
    });

    // Override getNumTokens to suppress tiktoken warnings for OpenRouter models
    model.getNumTokens = async () => 0;

    return {
      name: 'openrouter',
      model,
    };
  }
}

/**
 * Get hybrid AI providers for cost optimization
 * - Small model for tool calling and analysis iteration (cheap)
 * - Large model for final message synthesis (expensive but high quality)
 *
 * @param mode - 'chat' for real-time chat (default), 'proactive' for background proactive messages
 */
export function getHybridAIProvider(mode: 'chat' | 'proactive' = 'chat'): HybridAIProvider {
  // Small model for tool calling (can be Ollama local or OpenRouter cheap model)
  const smallModelProvider = mode === 'proactive' && env.PROACTIVE_SMALL_PROVIDER
    ? env.PROACTIVE_SMALL_PROVIDER
    : (env.HYBRID_SMALL_PROVIDER || 'ollama');
  const smallModelName = mode === 'proactive' && env.PROACTIVE_SMALL_MODEL
    ? env.PROACTIVE_SMALL_MODEL
    : (env.HYBRID_SMALL_MODEL || 'qwen2.5:32b');

  let smallModel: any;
  if (smallModelProvider === 'ollama') {
    smallModel = new ChatOllama({
      baseUrl: env.OLLAMA_BASE_URL,
      model: smallModelName,
      temperature: 0.7,
      streaming: false, // Don't stream tool calling
      numCtx: 32768,
    });
  } else {
    // Use OpenRouter for small model (e.g., gpt-oss-120b)
    smallModel = new ChatOpenAI({
      modelName: smallModelName,
      apiKey: env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://t1d-dashboard.local',
          'X-Title': 'T1D AI Assistant',
        },
      },
      temperature: 0.7,
      streaming: false, // Don't stream tool calling
      // Note: modelKwargs.reasoning removed - only needed for reasoning models (o1, DeepSeek R1)
      // gpt-oss-120b is not a reasoning model and this parameter may interfere with tool calling
    });
    smallModel.getNumTokens = async () => 0;
  }

  // Large model for message synthesis (OpenRouter by default)
  const largeModelName = mode === 'proactive' && env.PROACTIVE_LARGE_MODEL
    ? env.PROACTIVE_LARGE_MODEL
    : (env.HYBRID_LARGE_MODEL || 'anthropic/claude-sonnet-4-5');
  const largeModel = new ChatOpenAI({
    modelName: largeModelName,
    apiKey: env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://t1d-dashboard.local',
        'X-Title': 'T1D AI Assistant',
      },
    },
    temperature: 0.7,
    streaming: true, // Enable streaming for token-by-token responses
    maxTokens: 4096,
  });
  largeModel.getNumTokens = async () => 0;

  return {
    smallModel,
    largeModel,
    smallModelName: `${smallModelProvider}:${smallModelName}`,
    largeModelName: `openrouter:${largeModelName}`,
  };
}
