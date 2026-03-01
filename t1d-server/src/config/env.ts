import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3002'),
  HTTP_PORT: z.string().default('3003'),
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
  // Proactive message model configuration (defaults to hybrid settings if not specified)
  PROACTIVE_SMALL_PROVIDER: z.enum(['ollama', 'openrouter']).optional(),
  PROACTIVE_SMALL_MODEL: z.string().optional(),
  PROACTIVE_LARGE_MODEL: z.string().optional(),
  // Web Push Notification configuration
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().optional(), // Format: mailto:email@example.com
  // ActivityKit (Live Activity) push via direct APNs HTTP/2.
  // APNS_PRIVATE_KEY: full contents of the .p8 auth key (newlines as literal \n)
  // APNS_KEY_ID:      10-char Key ID shown next to the key in the Apple Developer portal
  // APNS_TEAM_ID:     10-char Team ID (top-right of Apple Developer portal)
  // APNS_BUNDLE_ID:   App bundle ID (e.g. com.auders.t1dsage)
  // APNS_PRODUCTION:  "true" for App Store / TestFlight; omit or "false" for dev builds
  APNS_PRIVATE_KEY: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  APNS_PRODUCTION: z.string().default('false'),
  // Voice/Audio configuration (OpenAI for Whisper STT and TTS)
  OPENAI_API_KEY: z.string().optional(),
  // Pattern detection interval (ms); 300000=5min for testing, 1800000=30min production
  PATTERN_DETECTION_INTERVAL: z.string().default('1800000'),
  // Path to Python 3 executable for execute_python tool
  PYTHON_PATH: z.string().default('python3'),
});

export const env = envSchema.parse(process.env);
