import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3002'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(['openrouter', 'ollama', 'hybrid']).default('ollama'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-sonnet-4.5'),
  OLLAMA_BASE_URL: z.string().default('http://192.168.202.132:11434'),
  OLLAMA_MODEL: z.string().default('glm-4.7-flash:latest'),
  LIBREVIEW_POLL_INTERVAL: z.string().default('60000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  // Hybrid model configuration (for cost optimization)
  HYBRID_SMALL_PROVIDER: z.enum(['ollama', 'openrouter']).default('ollama'),
  HYBRID_SMALL_MODEL: z.string().default('qwen2.5:32b'),
  HYBRID_LARGE_MODEL: z.string().default('anthropic/claude-sonnet-4.5'),
});

export const env = envSchema.parse(process.env);
