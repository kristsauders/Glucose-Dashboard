# Hybrid Model Configuration

The T1D AI Assistant supports a **hybrid model architecture** for cost optimization. This uses a smaller, cheaper model for tool calling and analysis iteration, and a larger, high-quality model for final message synthesis.

## Why Hybrid Mode?

Based on usage analysis for a single user:
- **Monthly tokens**: ~36.2M input, ~1.3M output
- **Sonnet 4.5 cost**: ~$128/month
- **gpt-oss-120b cost**: ~$1.65/month (77x cheaper)
- **Hybrid approach**: ~$15-20/month (85% savings)

The hybrid approach recognizes that:
- Tool calling and data analysis don't require top-tier reasoning
- Final message synthesis benefits greatly from high-quality models
- Most tokens are spent on tool calling iterations, not final responses

## Configuration Options

### Standard Mode (Single Model)

```bash
# Use Ollama (local, free)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://192.168.202.132:11434
OLLAMA_MODEL=qwen2.5:32b

# OR use OpenRouter (cloud)
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key-here
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
```

### Hybrid Mode (Recommended for Cost Optimization)

```bash
AI_PROVIDER=hybrid
OPENROUTER_API_KEY=your-key-here

# Small model for tool calling (choose one approach):

# Option 1: Use local Ollama (FREE, fast)
HYBRID_SMALL_PROVIDER=ollama
HYBRID_SMALL_MODEL=qwen2.5:32b
OLLAMA_BASE_URL=http://192.168.202.132:11434

# Option 2: Use OpenRouter cheap model ($1-2/month)
HYBRID_SMALL_PROVIDER=openrouter
HYBRID_SMALL_MODEL=google/gemini-2.0-flash-lite:free  # Free tier
# OR
HYBRID_SMALL_MODEL=mistralai/ministral-8b              # $0.10/M input, $0.10/M output

# Large model for message synthesis (high quality)
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5         # $3/M input, $15/M output
```

## How It Works

### Request Flow

1. **User sends message** → Chat route receives request
2. **Analysis Phase** (Small Model):
   - Agent analyzes request
   - Calls tools to gather data (glucose readings, patterns, statistics)
   - Iterates through multiple tool calls as needed
   - Stops when all needed data is collected
3. **Synthesis Phase** (Large Model):
   - Receives all conversation history + tool results
   - Synthesizes information into clear, insightful message
   - Streams response to user

### Cost Breakdown Example

Assuming single user, 30 days:

**Tool Calling (Small Model)**:
- Input: ~36M tokens × $0.10/M = $3.60
- Output: ~500K tokens × $0.10/M = $0.05
- **Subtotal: $3.65**

**Message Synthesis (Large Model)**:
- Input: ~2M tokens × $3/M = $6.00
- Output: ~800K tokens × $15/M = $12.00
- **Subtotal: $18.00**

**Total: ~$21.65/month** (vs $128 for all-Sonnet)

## Recommended Configurations

### Maximum Cost Savings (Ollama + Sonnet)

```bash
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=ollama
HYBRID_SMALL_MODEL=qwen2.5:32b
OLLAMA_BASE_URL=http://192.168.202.132:11434
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY=your-key-here
```

**Cost**: ~$18/month (only pay for synthesis)
**Requirements**: Ubuntu workstation with GPU for Ollama

### Balanced (Cloud Small + Sonnet)

```bash
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=openrouter
HYBRID_SMALL_MODEL=mistralai/ministral-8b
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY=your-key-here
```

**Cost**: ~$22/month
**Requirements**: Only OpenRouter API key

### Free Tier Option (Free Small + Sonnet)

```bash
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=openrouter
HYBRID_SMALL_MODEL=google/gemini-2.0-flash-lite:free
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY=your-key-here
```

**Cost**: ~$18/month (only synthesis)
**Note**: Free tier may have rate limits

## Testing

To test the hybrid mode:

1. **Set environment variables** in your `.env` file
2. **Restart server**: `npm run dev`
3. **Check logs** for confirmation:
   ```
   ✓ Using hybrid AI providers:
     - Small model (tool calling): ollama:qwen2.5:32b
     - Large model (synthesis): openrouter:anthropic/claude-sonnet-4.5
   ```
4. **Send a test message** that requires tool calls
5. **Observe console logs**:
   - `[analysisNode] Invoking small model for tool calling/analysis`
   - `[shouldContinue] Routing to tools`
   - `[synthesisNode] Invoking large model for final message synthesis`

## Model Recommendations

### Small Model (Tool Calling)

**Good Options**:
- `qwen2.5:32b` (Ollama) - Free, fast, good tool calling
- `mistralai/ministral-8b` - $0.10/M, decent tool calling
- `google/gemini-2.0-flash-lite:free` - Free, fast, good enough

**Avoid**:
- Very small models (<7B parameters) - poor tool calling
- Models without explicit tool calling support

### Large Model (Synthesis)

**Best Options**:
- `anthropic/claude-sonnet-4.5` - Best quality, analytical style
- `anthropic/claude-3.7-sonnet` - Slightly cheaper, still excellent
- `openai/gpt-4o` - Alternative if Anthropic unavailable

## Monitoring

Track your costs:

1. **OpenRouter Dashboard**: https://openrouter.ai/activity
2. **Token Counter Logs**: Check console for token usage per request
3. **Monthly Reports**: Use the reporting service to track patterns

## Troubleshooting

### "Small model not calling tools correctly"

- Try a larger model (e.g., qwen2.5:32b instead of qwen2.5:7b)
- Ensure model supports tool calling (check Ollama model card)
- Check console logs for tool binding errors

### "Synthesis messages seem generic"

- Large model may not have enough context
- Check that tool results are being passed correctly
- Verify HYBRID_LARGE_MODEL is set to a high-quality model

### "Higher costs than expected"

- Check if you're using correct model names (typos can default to expensive models)
- Review OpenRouter dashboard for actual model usage
- Ensure small model provider is set correctly

## Switching Back to Standard Mode

To revert to single-model mode:

```bash
# Use Ollama
AI_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:32b

# OR use OpenRouter
AI_PROVIDER=openrouter
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
```

Restart server and it will use the standard graph.
