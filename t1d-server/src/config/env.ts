import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3002'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  AI_PROVIDER: z.enum(['openrouter', 'ollama']).default('ollama'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-sonnet-4.5'),
  OLLAMA_BASE_URL: z.string().default('http://192.168.202.132:11434'),
  OLLAMA_MODEL: z.string().default('glm-4.7-flash:latest'),
  LIBREVIEW_POLL_INTERVAL: z.string().default('60000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export const env = envSchema.parse(process.env);
