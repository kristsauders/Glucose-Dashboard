import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { env } from '../config/env.js';

export interface AIProvider {
  model: any;
  name: string;
}

export function getAIProvider(): AIProvider {
  if (env.AI_PROVIDER === 'ollama') {
    return {
      name: 'ollama',
      model: new ChatOllama({
        baseUrl: env.OLLAMA_BASE_URL,
        model: env.OLLAMA_MODEL,
        temperature: 0.7,
        streaming: true, // Enable streaming
      }),
    };
  } else {
    // OpenRouter
    return {
      name: 'openrouter',
      model: new ChatOpenAI({
        modelName: env.OPENROUTER_MODEL,
        openAIApiKey: env.OPENROUTER_API_KEY,
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
        },
        temperature: 0.7,
        streaming: true, // Enable streaming
      }),
    };
  }
}
