# T1D AI Assistant - Cost Analysis (Updated Feb 2026)

## Executive Summary

**Your Current Setup**:
- **Models**: gpt-oss-120b (small) + Claude Sonnet 4.5 (large)
- **Frequency**: Every 90 minutes (16x/day)
- **Monthly Cost**: **$71.04/month**
  - Small model: $1.38
  - Large model: $69.66
- **Context Limits**: ~32K (small) ⚠️ + 200K (large)

**🎯 Best Upgrade Options:**

1. **GPT-5 Nano + Sonnet 4.5** = **$71.46/month** (+$0.42)
   - Same cost, 8x larger context (400K vs 32K)
   - **Recommended: No-brainer upgrade**

2. **GPT-5 Nano + DeepSeek V3.2** = **$7.11/month** (-$63.93, 90% savings!)
   - Worth testing - huge savings with large context

3. **Trinity Mini FREE + DeepSeek V3.2** = **$5.31/month** (-$65.73, 92% savings!)
   - Experimental free option

---

## 2026 Model Landscape: Large Context Revolution

The AI landscape has transformed dramatically in early 2026 with several models offering **large context windows** (128K-1M tokens) at dramatically reduced costs:

### Key Models Available on OpenRouter

| Model | Context | Input $/M | Output $/M | Best For |
|-------|---------|-----------|------------|----------|
| **GPT-5 Nano** | 400K | $0.050 | $0.400 | Fast tool calling, cheap iterations |
| **DeepSeek V3.2** | 164K | $0.25 | $0.38 | "Value king" - frontier performance at 1/100th cost |
| **DeepSeek V3.1** | 164K | $0.21 | $0.79 | Hybrid reasoning, long context |
| **GLM-4.7** | 203K | $0.40 | $1.50 | Coding, stable reasoning |
| **Gemini 3 Flash** | 1M | $0.50 | $3.00 | Huge context, multimodal |
| **Claude Sonnet 4.5** | 200K | $3.00 | $15.00 | Medical insights, analysis |
| **Trinity Large (FREE)** | 512K | FREE | FREE | Creative tasks, limited time offer |
| **Trinity Mini (FREE)** | 131K | FREE | FREE | Reasoning, free tier available |

**Why This Matters for Sage:**
- Current model (gpt-oss-120b) has only ~32K context
- With 400K-1M context, we can include much more glucose history in each analysis
- Cheaper models with huge context = better analysis at lower cost

---

## Current Configuration

**Small Model (Tool Iterations)**: `gpt-oss-120b` via OpenRouter
- $0.039/M input tokens
- $0.19/M output tokens
- **~32K context** (limiting factor)

**Large Model (Message Synthesis)**: `anthropic/claude-sonnet-4.5` via OpenRouter
- $3/M input tokens
- $15/M output tokens
- 200K context

**Proactive Monitoring**: Every 90 minutes (16x per day) ← **NEW**

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

#### Proactive Monitoring (16x/day × 30 days = 480 analyses) ← **90 MINUTE FREQUENCY**

| Component | Input Tokens | Output Tokens |
|-----------|--------------|---------------|
| Small model | 25M | 192k |
| Large model | 14.4M | 384k |

#### Chat Usage (estimate: 10/day × 30 days = 300 chats)

| Component | Input Tokens | Output Tokens |
|-----------|--------------|---------------|
| Small model | 9M | 60k |
| Large model | 6M | 180k |

#### **Total Monthly Usage (90-minute proactive)**

| Component | Input Tokens | Output Tokens |
|-----------|--------------|---------------|
| **Small model** | **34M** | **252k** |
| **Large model** | **20.4M** | **564k** |

---

## Cost Comparison: 2026 Large Context Options

### 🆕 Option 0: GPT-5 Nano + Sonnet 4.5 (LOWER COST, 8X CONTEXT!) ⭐⭐⭐
**Proactive: Every 90 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (GPT-5 Nano) | 34M × $0.050 = $1.70 | 252k × $0.400 = $0.10 | $1.80 |
| Large (Sonnet 4.5) | 20.4M × $3 = $61.20 | 564k × $15 = $8.46 | $69.66 |
| **TOTAL** | | | **$71.46/month** |

**Context Windows**: 400K (small) + 200K (large)

**Pros**:
- **Nearly identical cost** to current setup (+$1.22/month)
- **8x larger context** for small model (400K vs 32K)
- GPT-5 Nano is optimized for tool calling (faster, more accurate)
- Can include weeks of glucose history in single analysis

**Cons**: Slightly more expensive for tool iterations ($1.80 vs $1.38)

**Why This Is Amazing**: You get frontier-level tool calling with 400K context for basically the same price. This is a no-brainer upgrade.

---

### 🆕 Option 0B: GPT-5 Nano + DeepSeek V3.2 (ULTRA BUDGET) ⭐⭐⭐
**Proactive: Every 90 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (GPT-5 Nano) | 34M × $0.050 = $1.70 | 252k × $0.400 = $0.10 | $1.80 |
| Large (DeepSeek V3.2) | 20.4M × $0.25 = $5.10 | 564k × $0.38 = $0.21 | $5.31 |
| **TOTAL** | | | **$7.11/month** |

**Context Windows**: 400K (small) + 164K (large)

**Pros**:
- **90% cost reduction** vs current ($70.24 → $7.11)
- Both models have huge context windows
- DeepSeek V3.2 called "value king of 2026" - matches frontier models
- GPT-5 Nano excellent for tool calling

**Cons**:
- DeepSeek V3.2 not as polished as Claude for medical insights
- May need to test synthesis quality

**Why Consider This**: If you want to experiment or reduce costs dramatically while still having large context.

---

### 🆕 Option 0C: DeepSeek V3.2 + DeepSeek V3.2 (PURE VALUE)
**Proactive: Every 90 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (DeepSeek V3.2) | 34M × $0.25 = $8.50 | 252k × $0.38 = $0.10 | $8.60 |
| Large (DeepSeek V3.2) | 20.4M × $0.25 = $5.10 | 564k × $0.38 = $0.21 | $5.31 |
| **TOTAL** | | | **$13.91/month** |

**Context Windows**: 164K (both)

**Pros**:
- **80% cost reduction** vs current ($70.24 → $13.91)
- Consistent model across both phases
- 164K context is plenty for glucose analysis
- DeepSeek V3.2 matches frontier models at 1/100th cost

**Cons**: Less specialization (same model for tools and synthesis)

---

### 🆕 Option 0D: FREE Trinity Mini + DeepSeek V3.2 (EXPERIMENTAL)
**Proactive: Every 90 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (Trinity Mini FREE) | FREE | FREE | $0 |
| Large (DeepSeek V3.2) | 20.4M × $0.25 = $5.10 | 564k × $0.38 = $0.21 | $5.31 |
| **TOTAL** | | | **$5.31/month** |

**Context Windows**: 131K (small) + 164K (large)

**Pros**:
- **92% cost reduction** vs current ($70.24 → $5.31)
- FREE tool iterations (rate-limited)
- Trinity Mini is 26B parameter reasoning model
- Large context on both models

**Cons**:
- Free tier may have rate limits
- Trinity Mini not proven for tool calling
- Experimental - may need fallback

**Why Try This**: If you want to test free models and push the cost floor even lower.

---

### Option 1: Current Setup (gpt-oss-120b + Sonnet 4.5) ← **YOUR CURRENT CONFIG**
**Proactive: Every 90 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (gpt-oss-120b) | 34M × $0.039 = $1.33 | 252k × $0.19 = $0.05 | $1.38 |
| Large (Sonnet 4.5) | 20.4M × $3 = $61.20 | 564k × $15 = $8.46 | $69.66 |
| **TOTAL** | | | **$71.04/month** |

**Context Windows**: ~32K (small) + 200K (large) ⚠️ **SMALL CONTEXT BOTTLENECK**

**Pros**: Proven configuration, works well
**Cons**:
- Small model has very limited context (~32K)
- Can't include much glucose history in analysis
- Not taking advantage of 2026 pricing improvements

---

### Option 2: Ollama Local + Sonnet 4.5
**Proactive: Every 90 minutes**

| Model | Input Cost | Output Cost | Total |
|-------|------------|-------------|-------|
| Small (Ollama qwen2.5:32b) | FREE | FREE | $0 |
| Large (Sonnet 4.5) | 20.4M × $3 = $61.20 | 564k × $15 = $8.46 | $69.66 |
| **TOTAL** | | | **$69.66/month** |

**Pros**:
- FREE tool iterations (runs on your Ubuntu GPU)
- Same high-quality synthesis as Option 1
- Only $1.38/month savings vs current

**Cons**: Requires Ollama running on Ubuntu
**Savings vs Current**: $1.38/month

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

## 2026 Recommendations by Priority

### 🥇 #1: GPT-5 Nano + Sonnet 4.5, Every 30 minutes (BEST UPGRADE)
**Monthly Cost**: $171.40 (vs $170.35 current)
**Change**: +$1.05/month (0.6% increase)

**Why This Is The Clear Winner**:
- **Same cost** as current setup (+$1/month is negligible)
- **8x larger context window** (400K vs 32K) - MASSIVE improvement
- **Better tool calling** - GPT-5 Nano optimized for function calling
- **Same quality synthesis** - Still using Sonnet 4.5 for final messages
- **No infrastructure changes** - Pure cloud, just update .env
- **Include weeks of data** - 400K context means comprehensive historical analysis

**Setup**:
```env
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=openrouter
HYBRID_SMALL_MODEL=openai/gpt-5-nano
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5
```

**This is a no-brainer upgrade. Same cost, 8x better context.**

---

### 🥈 #2: GPT-5 Nano + DeepSeek V3.2, Every 30 minutes (ULTRA BUDGET)
**Monthly Cost**: $17.21 (vs $170.35 current)
**Savings**: $153.14/month (90% reduction!)

**Why Consider This**:
- **Massive cost savings** - 90% less than current
- **Large context on both** - 400K + 164K context windows
- **DeepSeek V3.2 = "Value King"** - Matches frontier models at 1/100th cost
- **No infrastructure changes** - Cloud-based
- **Experiment-friendly** - So cheap you can try different configs

**Tradeoffs**:
- DeepSeek V3.2 may not be as polished as Claude for medical insights
- Need to test synthesis quality (but at this price, worth testing!)

**Setup**:
```env
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=openrouter
HYBRID_SMALL_MODEL=openai/gpt-5-nano
HYBRID_LARGE_MODEL=deepseek/deepseek-v3.2
```

---

### 🥉 #3: Ollama + Sonnet 4.5, Every 60 minutes (LOCAL + QUALITY)
**Monthly Cost**: $94.37 (vs $170.35 current)
**Savings**: $75.98/month (45%)

**Why Consider This**:
- **FREE local tool iterations** (Ollama on your Ubuntu GPU)
- **High-quality synthesis** (Sonnet 4.5)
- **Reduced frequency** saves additional cost
- **Privacy** - Tool iterations never leave your machine

**Cons**:
- Requires Ollama setup and running
- Ollama models have smaller context (~32K typical)
- Reduced proactive frequency (60 min vs 30 min)

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

### #4: DeepSeek V3.2 + DeepSeek V3.2, Every 30 minutes (PURE VALUE)
**Monthly Cost**: $34.00
**Savings**: $136.35/month (80%)

**Why Consider This**:
- **Huge savings** - 80% less than current
- **164K context** on both models (5x better than gpt-oss-120b)
- **Consistent model** across phases
- **Frontier performance** at bargain price

**Cons**:
- Less specialization (same model for tools and synthesis)
- Need to validate medical insight quality

**Setup**:
```env
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=openrouter
HYBRID_SMALL_MODEL=deepseek/deepseek-v3.2
HYBRID_LARGE_MODEL=deepseek/deepseek-v3.2
```

---

### #5 (Experimental): Trinity Mini FREE + DeepSeek V3.2, Every 30 minutes
**Monthly Cost**: $12.76
**Savings**: $157.59/month (93%)

**Why Experiment**:
- **Cheapest possible** - 93% savings!
- **FREE tool iterations** (Trinity Mini free tier)
- **Large context** - 131K + 164K
- **Worth testing** at this price point

**Risks**:
- Free tier rate limits may be restrictive
- Trinity Mini not proven for tool calling (26B reasoning model)
- May need fallback to paid model

**Setup**:
```env
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=openrouter
HYBRID_SMALL_MODEL=arcee-ai/trinity-mini
HYBRID_LARGE_MODEL=deepseek/deepseek-v3.2
```

---

## 2026 Decision Matrix (90-minute proactive frequency)

| Option | Monthly Cost | Context (Small/Large) | Quality | Cloud/Local | Savings |
|--------|--------------|----------------------|---------|-------------|---------|
| **🏆 GPT-5 Nano + Sonnet 4.5** | **$71.46** | **400K/200K** | **Excellent** | **Cloud** | **$0 (same!)** |
| GPT-5 Nano + DeepSeek V3.2 | $7.11 | 400K/164K | Very Good | Cloud | $64 (90%) |
| DeepSeek V3.2 + DeepSeek V3.2 | $13.91 | 164K/164K | Very Good | Cloud | $57 (80%) |
| Trinity Mini FREE + DeepSeek | $5.31 | 131K/164K | Unknown* | Cloud | $66 (92%) |
| **Current** (gpt-oss + Sonnet) | **$71.04** | **32K/200K ⚠️** | **Good** | **Cloud** | **-** |
| Ollama + Sonnet | $69.66 | 32K/200K | Excellent | Local | $1 (2%) |

*Needs testing - free tier is experimental

---

## My 2026 Recommendation (for 90-minute proactive)

### 🎯 Primary Recommendation: GPT-5 Nano + Sonnet 4.5

**Monthly Cost**: $71.46 (vs $71.04 current = +$0.42)

**This is the obvious choice because**:

1. **Literally the same cost** - You're paying 42¢ more per month (0.6% increase)
2. **8x larger context window** - 400K vs 32K on the small model
3. **Massive capability upgrade**:
   - Can include weeks of glucose history in every analysis
   - Tool iterations have full historical context
   - GPT-5 Nano is optimized specifically for function calling
   - No more context truncation issues
4. **Zero risk** - Same large model (Sonnet 4.5) for synthesis
5. **No infrastructure changes** - Pure cloud, just update .env
6. **2026 pricing advantage** - Taking advantage of new model economics

**Implementation**:
```bash
# Update .env
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=openrouter
HYBRID_SMALL_MODEL=openai/gpt-5-nano
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5
```

**That's it. Restart server and you're running 2026 tech at 2025 prices.**

---

### 🧪 Secondary Recommendation: Test GPT-5 Nano + DeepSeek V3.2

**Monthly Cost**: $7.11 (90% savings!)

**Why you should test this**:
- At $7/month, you can afford to experiment
- DeepSeek V3.2 is called "the value king of 2026"
- Both models have huge context windows (400K + 164K)
- If synthesis quality is acceptable, you save $768/year

**Test Plan**:
1. Switch to this config for a week
2. Compare synthesis quality to Sonnet 4.5
3. Check if medical insights are accurate and helpful
4. If good enough → stick with it and save 90%
5. If not → fall back to GPT-5 Nano + Sonnet (same cost as current)

**Implementation**:
```bash
# Update .env
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=openrouter
HYBRID_SMALL_MODEL=openai/gpt-5-nano
HYBRID_LARGE_MODEL=deepseek/deepseek-v3.2
```

**Risk**: Low - You can always switch back, and at $7/month you're not risking much

---

### 📊 Comparison Summary

**What you should do**:

**Immediate**: Switch to GPT-5 Nano + Sonnet 4.5
- Same cost, 8x better context
- No-brainer upgrade

**Next week**: Test GPT-5 Nano + DeepSeek V3.2
- Save $153/month if quality is acceptable
- Worth testing at that price point

**Fallback**: If DeepSeek synthesis isn't good enough
- Stay with GPT-5 Nano + Sonnet 4.5
- Still getting 8x context upgrade at same cost

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

## Why Context Window Matters for Sage

The context window is critically important for glucose analysis. Here's why the upgrade from 32K → 400K is transformational:

### Current Limitation (32K context)
- ~8,000 words of text
- ~2-3 days of glucose readings with metadata
- Must truncate historical data
- Can't include full pattern history
- Limited meal/exercise correlation analysis

### With 400K Context (GPT-5 Nano)
- ~100,000 words of text
- **30-40 days of detailed glucose data**
- Full meal, exercise, and insulin logs
- Complete pattern detection history
- All user memories and preferences
- No truncation needed

### Impact on Analysis Quality
**Before (32K)**:
```
User: "Why was my glucose high last Tuesday?"
Agent: [Can only see last 2-3 days of data, must make tool calls to fetch older data]
```

**After (400K)**:
```
User: "Why was my glucose high last Tuesday?"
Agent: [Has entire month in context, sees patterns immediately, correlates with similar events]
```

### Specific Benefits
1. **Pattern Recognition**: See weeks of patterns at once, identify trends immediately
2. **Correlation Analysis**: Compare current glucose to similar situations weeks ago
3. **Memory Integration**: All user preferences and habits in context
4. **Fewer Tool Calls**: Less back-and-forth, faster responses
5. **Better Reasoning**: More data = better physiological explanations

**This is why GPT-5 Nano + Sonnet 4.5 is such a game-changer at the same price.**

---

## Monitoring Your Actual Costs

Track your usage at: https://openrouter.ai/activity

Check monthly spending and adjust configuration if needed.

---

## Sources

Research for this 2026 cost analysis was compiled from:

- [OpenRouter Models Pricing](https://openrouter.ai/models)
- [GPT-5 Nano - OpenRouter](https://openrouter.ai/openai/gpt-5-nano)
- [GPT 5 Nano API Pricing 2026](https://pricepertoken.com/pricing-page/model/openai-gpt-5-nano)
- [GLM 4.7 - OpenRouter](https://openrouter.ai/z-ai/glm-4.7)
- [GLM 4.7 API Pricing 2026](https://pricepertoken.com/pricing-page/model/z-ai-glm-4.7)
- [DeepSeek V3.2 - OpenRouter](https://openrouter.ai/deepseek/deepseek-v3.2)
- [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Gemini 3 Flash Preview - OpenRouter](https://openrouter.ai/google/gemini-3-flash-preview)
- [Top AI Models on OpenRouter 2026](https://www.teamday.ai/blog/top-ai-models-openrouter-2026)
- [Trinity Large by Arcee AI](https://www.arcee.ai/blog/trinity-large)
- [Trinity Models - Arcee AI](https://www.arcee.ai/trinity)
- [Free Models Router - OpenRouter](https://openrouter.ai/openrouter/free)

*Last updated: February 4, 2026*
