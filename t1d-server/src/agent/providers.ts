import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { env } from '../config/env.js';

export interface AIProvider {
  model: any;
  name: string;
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
