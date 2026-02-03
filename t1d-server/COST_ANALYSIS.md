# T1D AI Assistant - Cost Analysis

## Current Configuration

**Small Model (Tool Iterations)**: `gpt-oss-120b` via OpenRouter
- $0.039/M input tokens
- $0.19/M output tokens

**Large Model (Message Synthesis)**: `anthropic/claude-sonnet-4.5` via OpenRouter
- $3/M input tokens
- $15/M output tokens

**Proactive Monitoring**: Every 30 minutes (48x per day)

---

## Token Usage Estimates

### Per Proactive Analysis (with proper truncation)

**Small Model (Tool Iterations)**:
- Iteration 1: 4k input, 100 output (system prompt + initial query)
- Iteration 2: 10k input, 100 output (+ tool results)
- Iteration 3: 16k input, 100 output (+ more tools)
- Iteration 4: 22k input, 100 output (+ final tools)
- **Average per analysis: 52k input, 400 output tokens**

**Large Model (Synthesis)**:
- Input: 30k tokens (full context + tool results)
- Output: 800 tokens (comprehensive message)
- **Per analysis: 30k input, 800 output tokens**

### Monthly Usage Breakdown

#### Proactive Monitoring (48x/day × 30 days = 1,440 analyses)

| Component | Input Tokens | Output Tokens |
|-----------|--------------|---------------|
| Small model | 75M | 576k |
| Large model | 43M | 1.15M |

#### Chat Usage (estimate: 10/day × 30 days = 300 chats)

| Component | Input Tokens | Output Tokens |
|-----------|--------------|---------------|
| Small model | 9M | 60k |
| Large model | 6M | 180k |

#### **Total Monthly Usage**

| Component | Input Tokens | Output Tokens |
|-----------|--------------|---------------|
| **Small model** | **84M** | **636k** |
| **Large model** | **49M** | **1.33M** |

---

## Cost Comparison: Model Options

### Option 1: Current Setup (gpt-oss-120b + Sonnet 4.5)
**Proactive: Every 30 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (gpt-oss-120b) | 84M × $0.039 = $3.28 | 636k × $0.19 = $0.12 | $3.40 |
| Large (Sonnet 4.5) | 49M × $3 = $147 | 1.33M × $15 = $19.95 | $166.95 |
| **TOTAL** | | | **$170.35/month** |

**Pros**: Good balance of cost and quality for tool iterations
**Cons**: Still paying for tool iterations

---

### Option 2: Ollama Local + Sonnet 4.5 ⭐ RECOMMENDED
**Proactive: Every 30 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (Ollama qwen2.5:32b) | FREE | FREE | $0 |
| Large (Sonnet 4.5) | 49M × $3 = $147 | 1.33M × $15 = $19.95 | $166.95 |
| **TOTAL** | | | **$166.95/month** |

**Pros**:
- FREE tool iterations (runs on your Ubuntu GPU)
- Same high-quality synthesis as Option 1
- Only $3.40/month more expensive than current but runs locally

**Cons**: Requires Ollama running on Ubuntu
**Savings vs Current**: $3.40/month

---

### Option 3: gpt-oss-120b + Opus 4.5
**Proactive: Every 30 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (gpt-oss-120b) | 84M × $0.039 = $3.28 | 636k × $0.19 = $0.12 | $3.40 |
| Large (Opus 4.5) | 49M × $5 = $245 | 1.33M × $25 = $33.25 | $278.25 |
| **TOTAL** | | | **$281.65/month** |

**Pros**: Highest quality synthesis (Opus 4.5)
**Cons**: Expensive - 65% more than current
**vs Current**: +$111.30/month

---

### Option 4: Ollama + Opus 4.5
**Proactive: Every 30 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (Ollama qwen2.5:32b) | FREE | FREE | $0 |
| Large (Opus 4.5) | 49M × $5 = $245 | 1.33M × $25 = $33.25 | $278.25 |
| **TOTAL** | | | **$278.25/month** |

**Pros**: Free tool iterations + best synthesis quality
**Cons**: Very expensive for synthesis
**vs Current**: +$107.90/month

---

### Option 5: glm-4.7 + Sonnet 4.5
**Proactive: Every 30 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (glm-4.7) | 84M × $0.40 = $33.60 | 636k × $1.50 = $0.95 | $34.55 |
| Large (Sonnet 4.5) | 49M × $3 = $147 | 1.33M × $15 = $19.95 | $166.95 |
| **TOTAL** | | | **$201.50/month** |

**Pros**: GLM-4.7 has good tool calling capability
**Cons**: 10x more expensive than gpt-oss-120b for tool iterations
**vs Current**: +$31.15/month

---

### Option 6: Ollama + glm-4.7 (Budget Option)
**Proactive: Every 30 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (Ollama qwen2.5:32b) | FREE | FREE | $0 |
| Large (glm-4.7) | 49M × $0.40 = $19.60 | 1.33M × $1.50 = $2.00 | $21.60 |
| **TOTAL** | | | **$21.60/month** |

**Pros**: Very cheap - only $21.60/month total
**Cons**: Lower quality synthesis than Sonnet/Opus
**Savings vs Current**: $148.75/month (87% savings!)

---

## Cost Impact of Proactive Frequency

### Current: Every 30 minutes (48x/day)
**Monthly Cost (gpt-oss-120b + Sonnet 4.5)**: $170.35

### Reduce to: Every 60 minutes (24x/day)
**Monthly Cost (gpt-oss-120b + Sonnet 4.5)**: $96.25
**Savings**: $74.10/month (43% reduction)

| Model | Input Tokens | Output Tokens | Cost |
|-------|--------------|---------------|------|
| Small | 46.5M | 345k | $1.88 |
| Large | 27M | 750k | $94.37 |

### Reduce to: Every 90 minutes (16x/day)
**Monthly Cost (gpt-oss-120b + Sonnet 4.5)**: $70.24
**Savings**: $100.11/month (59% reduction)

| Model | Input Tokens | Output Tokens | Cost |
|-------|--------------|---------------|------|
| Small | 33.5M | 252k | $1.36 |
| Large | 19.4M | 548k | $68.88 |

### Reduce to: Every 2 hours (12x/day)
**Monthly Cost (gpt-oss-120b + Sonnet 4.5)**: $57.23
**Savings**: $113.12/month (66% reduction)

| Model | Input Tokens | Output Tokens | Cost |
|-------|--------------|---------------|------|
| Small | 27.7M | 216k | $1.12 |
| Large | 15.6M | 468k | $56.11 |

---

## Recommendations by Priority

### 1. Best Value: Ollama + Sonnet 4.5, Every 60 minutes
**Monthly Cost**: $94.37 (vs $170.35 current)
**Savings**: $75.98/month (45%)

**Why**:
- FREE local tool iterations (Ollama)
- High-quality synthesis (Sonnet 4.5)
- Reasonable proactive frequency (still get insights throughout day)
- Requires Ubuntu machine with Ollama

**Setup**:
```env
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=ollama
HYBRID_SMALL_MODEL=qwen2.5:32b
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5
OLLAMA_BASE_URL=http://localhost:11434
```

Change proactive interval in `src/services/proactive-monitor.ts`:
```typescript
private checkInterval: number = 60 * 60 * 1000; // 60 minutes
```

---

### 2. Premium Quality: Ollama + Opus 4.5, Every 60 minutes
**Monthly Cost**: $162.64
**Savings**: $7.71/month (5%)

**Why**:
- FREE local tool iterations
- BEST synthesis quality (Opus 4.5)
- Still reasonable cost with reduced frequency
- Best insights and explanations

**Setup**: Same as above but use:
```env
HYBRID_LARGE_MODEL=anthropic/claude-opus-4-5
```

---

### 3. Ultra Budget: Ollama + glm-4.7, Every 60 minutes
**Monthly Cost**: $12.36
**Savings**: $158/month (93%)

**Why**:
- FREE local tool iterations
- Acceptable synthesis quality for general use
- Extremely cheap
- Good for experimentation

**Setup**:
```env
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=ollama
HYBRID_SMALL_MODEL=qwen2.5:32b
HYBRID_LARGE_MODEL=glm-4.7
OLLAMA_BASE_URL=http://localhost:11434
```

---

### 4. Keep Current, Reduce Frequency: gpt-oss-120b + Sonnet 4.5, Every 90 minutes
**Monthly Cost**: $70.24
**Savings**: $100.11/month (59%)

**Why**:
- No infrastructure changes needed
- Still cloud-based (no local dependencies)
- Major cost savings from reduced frequency
- Still get regular insights (every 1.5 hours)

**Setup**: Just change proactive interval:
```typescript
private checkInterval: number = 90 * 60 * 1000; // 90 minutes
```

---

## Decision Matrix

| Option | Monthly Cost | Quality | Requires Local | Savings vs Current |
|--------|--------------|---------|----------------|-------------------|
| **Current** (30 min) | $170.35 | Good | No | - |
| Ollama + Sonnet (60 min) ⭐ | $94.37 | Excellent | Yes | $76 (45%) |
| Ollama + Opus (60 min) | $162.64 | Best | Yes | $8 (5%) |
| Ollama + glm-4.7 (60 min) | $12.36 | Good | Yes | $158 (93%) |
| Current (60 min) | $96.25 | Good | No | $74 (43%) |
| Current (90 min) | $70.24 | Good | No | $100 (59%) |

---

## My Recommendation

**Go with: Ollama + Sonnet 4.5, Every 60 minutes**

**Reasoning**:
1. **Saves $76/month** (45% reduction) vs current
2. **Free tool iterations** - runs on your Ubuntu GPU
3. **High-quality synthesis** - Sonnet 4.5 is excellent for medical insights
4. **Reasonable frequency** - Every hour is still quite responsive
5. **No quality sacrifice** - Using same large model as current

**Implementation**:
1. Update `.env` to use `hybrid` with `ollama` for small model
2. Change proactive interval to 60 minutes in `proactive-monitor.ts`
3. Ensure Ollama is running: `ollama pull qwen2.5:32b`
4. Restart server: `npm run dev`

**If you want to splurge**: Upgrade to Opus 4.5 for synthesis (+$68/month) for even better physiological explanations and pattern analysis.

---

## Testing Different Configurations

You can easily switch models by editing `.env`:

```bash
# Test different small models
HYBRID_SMALL_MODEL=qwen2.5:32b        # Ollama, free
HYBRID_SMALL_MODEL=glm-4.7            # OpenRouter, $0.40/M

# Test different large models
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5      # $3/M input
HYBRID_LARGE_MODEL=anthropic/claude-opus-4-5        # $5/M input
HYBRID_LARGE_MODEL=glm-4.7                          # $0.40/M input
```

Restart the server after changes to test the new configuration.

---

## Questions to Consider

1. **How important is response time?**
   - Ollama (local) is faster for tool iterations
   - Cloud models have network latency

2. **How valuable are the proactive insights?**
   - Every 30 min: Very responsive, catches patterns quickly
   - Every 60 min: Still good, balances cost and responsiveness
   - Every 90+ min: More cost-effective, may miss some timely insights

3. **Quality vs Cost tradeoff?**
   - Sonnet 4.5: Best balance (excellent quality, reasonable cost)
   - Opus 4.5: Best quality, highest cost
   - glm-4.7: Good quality, very cheap

4. **Infrastructure preference?**
   - Ollama: Requires Ubuntu machine with GPU, but FREE and fast
   - OpenRouter: No local infrastructure, pay per token

---

## Monitoring Your Actual Costs

Track your usage at: https://openrouter.ai/activity

Check monthly spending and adjust configuration if needed.
