import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

console.log('🔍 T1D Server Configuration Check\n');

console.log('AI Provider Configuration:');
console.log('─'.repeat(50));
console.log(`AI_PROVIDER: ${process.env.AI_PROVIDER || 'NOT SET'}`);
console.log('');

if (process.env.AI_PROVIDER === 'hybrid') {
  console.log('Hybrid Mode Configuration:');
  console.log(`  HYBRID_SMALL_PROVIDER: ${process.env.HYBRID_SMALL_PROVIDER || 'NOT SET (defaults to ollama)'}`);
  console.log(`  HYBRID_SMALL_MODEL: ${process.env.HYBRID_SMALL_MODEL || 'NOT SET (defaults to qwen2.5:32b)'}`);
  console.log(`  HYBRID_LARGE_MODEL: ${process.env.HYBRID_LARGE_MODEL || 'NOT SET (defaults to anthropic/claude-sonnet-4.5)'}`);
  console.log('');

  const smallProvider = process.env.HYBRID_SMALL_PROVIDER || 'ollama';
  const smallModel = process.env.HYBRID_SMALL_MODEL || 'qwen2.5:32b';

  if (smallProvider === 'ollama') {
    console.log('✅ Small model: Using LOCAL Ollama (FREE, 32k context)');
    console.log(`   Model: ${smallModel}`);
    console.log(`   Ollama URL: ${process.env.OLLAMA_BASE_URL || 'http://192.168.202.132:11434'}`);
  } else if (smallProvider === 'openrouter') {
    console.log('⚠️  Small model: Using OPENROUTER (PAID, 131k context)');
    console.log(`   Model: ${smallModel}`);
    console.log('   This will use OpenRouter API calls for tool iterations!');
    console.log('   Cost: ~$1-5/month depending on model');
  }
  console.log('');

  const largeModel = process.env.HYBRID_LARGE_MODEL || 'anthropic/claude-sonnet-4.5';
  console.log('✅ Large model: Using OpenRouter for synthesis');
  console.log(`   Model: ${largeModel}`);
  console.log('   Cost: ~$18-20/month for synthesis only');

} else if (process.env.AI_PROVIDER === 'ollama') {
  console.log('Standard Ollama Configuration:');
  console.log(`  Model: ${process.env.OLLAMA_MODEL || 'NOT SET'}`);
  console.log(`  URL: ${process.env.OLLAMA_BASE_URL || 'NOT SET'}`);
  console.log('  Context limit: 32k tokens');
} else if (process.env.AI_PROVIDER === 'openrouter') {
  console.log('Standard OpenRouter Configuration:');
  console.log(`  Model: ${process.env.OPENROUTER_MODEL || 'NOT SET'}`);
  console.log('  Context limit: Varies by model');
}

console.log('');
console.log('─'.repeat(50));

// Check for context overflow risk
if (process.env.AI_PROVIDER === 'hybrid') {
  const smallProvider = process.env.HYBRID_SMALL_PROVIDER || 'ollama';
  if (smallProvider === 'openrouter') {
    console.log('');
    console.log('⚠️  WARNING: CONTEXT OVERFLOW RISK');
    console.log('');
    console.log('You are using OpenRouter for the small model (tool iterations).');
    console.log('OpenRouter has a 131k token limit, but tool iterations can grow quickly.');
    console.log('');
    console.log('RECOMMENDED FIX:');
    console.log('  1. Set HYBRID_SMALL_PROVIDER=ollama in your .env');
    console.log('  2. Make sure Ollama is running locally');
    console.log('  3. Pull qwen2.5:32b: ollama pull qwen2.5:32b');
    console.log('  4. Restart server');
    console.log('');
    console.log('This will:');
    console.log('  - Use FREE local Ollama for tool iterations (32k context)');
    console.log('  - Use paid Sonnet 4.5 only for final message synthesis');
    console.log('  - Save ~$3-5/month in API costs');
    console.log('  - Prevent context overflow errors');
    console.log('');
  }
}

console.log('Database:');
console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ NOT SET'}`);
console.log('');

console.log('Other Services:');
console.log(`  LibreView Polling: Every ${process.env.LIBREVIEW_POLL_INTERVAL || '60000'}ms`);
console.log(`  CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
console.log(`  Discord: ${process.env.DISCORD_WEBHOOK_URL ? '✅ Configured' : '❌ Not configured'}`);
