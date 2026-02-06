# T1D AI Assistant - Cost Analysis (Updated Feb 2026)

## Executive Summary

**Your Current Setup** (with proactive optimization):
- **Models**: gpt-oss-120b (small) + Claude Sonnet 4.5 (large)
- **Proactive Frequency**: Every 90 minutes (16x/day)
- **Proactive Optimization**: ✅ Only calls Sonnet 4.5 when sending message (20% of analyses)
- **Monthly Cost**: **$31.87/month** ⬇️ 55% reduction from old cost!
  - Small model (gpt-oss-120b): $1.38
  - Large model (Sonnet 4.5): $30.49
- **Context**: 128K (small) + 200K (large)

**🎯 30-Minute Interval Analysis**:
- **Monthly Cost**: **$53.52/month**
- **Increase**: +$21.65/month vs current 90-minute
- **Still 25% cheaper than old 90-minute setup!**
- **Recommendation**: ✅ **Switch to 30-minute intervals** - Cost is very reasonable!

---

## Key Optimization: Proactive Message Flow

Your proactive system now has a smart two-phase approach:

### Phase 1: Analysis + Decision (Always runs)
- **Model**: gpt-oss-120b (cheap!)
- **Purpose**: Gather data, analyze patterns, decide if message is worth sending
- **Token usage**: ~52k input, ~600 output per analysis
- **Cost per analysis**: ~$0.002

### Phase 2: Final Synthesis (Only if sending message)
- **Model**: Claude Sonnet 4.5 (premium)
- **Purpose**: Create the actual proactive message for the user
- **Frequency**: ~20% of analyses result in sending (estimated)
- **Token usage**: ~30k input, ~800 output per message
- **Cost per message**: ~$0.10

**This is brilliant because**:
- 80% of proactive checks use ONLY the cheap model
- Only pay for Sonnet 4.5 when you actually get value (a message)
- Massive cost reduction while maintaining quality

---

## Updated Cost Breakdown

### Option 1: Current Setup - 90-Minute Intervals ⭐ CURRENT
**Monthly Cost**: **$31.87/month**

#### Proactive Monitoring (16x/day × 30 days = 480 analyses)
Assuming 20% send rate = 96 messages sent

| Component | Purpose | Input Tokens | Output Tokens | Cost |
|-----------|---------|--------------|---------------|------|
| gpt-oss-120b | Analysis (all 480) | 24.96M | 288k | $1.02 |
| Sonnet 4.5 | Synthesis (96 sent) | 2.88M | 76.8k | $9.79 |

#### Chat Usage (10/day × 30 days = 300 chats)

| Component | Input Tokens | Output Tokens | Cost |
|-----------|--------------|---------------|------|
| gpt-oss-120b | 9M | 60k | $0.36 |
| Sonnet 4.5 | 6M | 180k | $20.70 |

#### Total Monthly Cost
| Model | Proactive | Chat | **Total** |
|-------|-----------|------|-----------|
| gpt-oss-120b | $1.02 | $0.36 | **$1.38** |
| Sonnet 4.5 | $9.79 | $20.70 | **$30.49** |
| **TOTAL** | | | **$31.87/month** |

**Savings vs old setup**: $39.17/month (55% reduction!)

---

### Option 2: 30-Minute Intervals ⭐ RECOMMENDED
**Monthly Cost**: **$53.52/month**

#### Proactive Monitoring (48x/day × 30 days = 1,440 analyses)
Assuming 20% send rate = 288 messages sent

| Component | Purpose | Input Tokens | Output Tokens | Cost |
|-----------|---------|--------------|---------------|------|
| gpt-oss-120b | Analysis (all 1,440) | 74.88M | 864k | $3.08 |
| Sonnet 4.5 | Synthesis (288 sent) | 8.64M | 230.4k | $29.38 |

#### Chat Usage (same as above)

| Component | Input Tokens | Output Tokens | Cost |
|-----------|--------------|---------------|------|
| gpt-oss-120b | 9M | 60k | $0.36 |
| Sonnet 4.5 | 6M | 180k | $20.70 |

#### Total Monthly Cost
| Model | Proactive | Chat | **Total** |
|-------|-----------|------|-----------|
| gpt-oss-120b | $3.08 | $0.36 | **$3.44** |
| Sonnet 4.5 | $29.38 | $20.70 | **$50.08** |
| **TOTAL** | | | **$53.52/month** |

**Impact of 30-minute intervals**:
- +$21.65/month vs 90-minute (+68% increase)
- Still 25% cheaper than old 90-minute setup ($71.04)
- 3x more frequent checks for only 68% more cost
- **Cost per additional check**: ~$0.02 (very affordable!)

**✅ Recommendation**: Switch to 30-minute intervals - the cost is very reasonable given the value of more frequent monitoring.

---

### Option 3: 60-Minute Intervals (Middle Ground)
**Monthly Cost**: **$41.87/month**

#### Proactive Monitoring (24x/day × 30 days = 720 analyses)
Assuming 20% send rate = 144 messages sent

| Component | Purpose | Input Tokens | Output Tokens | Cost |
|-----------|---------|--------------|---------------|------|
| gpt-oss-120b | Analysis (all 720) | 37.44M | 432k | $1.54 |
| Sonnet 4.5 | Synthesis (144 sent) | 4.32M | 115.2k | $14.70 |

#### Chat Usage (same as above)

| Component | Input Tokens | Output Tokens | Cost |
|-----------|--------------|---------------|------|
| gpt-oss-120b | 9M | 60k | $0.36 |
| Sonnet 4.5 | 6M | 180k | $20.70 |

#### Total Monthly Cost
| Model | Proactive | Chat | **Total** |
|-------|-----------|------|-----------|
| gpt-oss-120b | $1.54 | $0.36 | **$1.90** |
| Sonnet 4.5 | $14.70 | $20.70 | **$35.40** |
| **TOTAL** | | | **$41.87/month** |

**Good balance**: More frequent than 90-min, cheaper than 30-min.

---

## Frequency Comparison Table

| Interval | Checks/Day | Analyses/Month | Messages Sent/Month* | Monthly Cost | vs 90-min | Cost per Check |
|----------|------------|----------------|----------------------|--------------|-----------|----------------|
| **30 min** | 48 | 1,440 | 288 | **$53.52** | +$21.65 | $0.037 |
| **60 min** | 24 | 720 | 144 | **$41.87** | +$10.00 | $0.058 |
| **90 min** ⬅️ | 16 | 480 | 96 | **$31.87** | - | $0.066 |
| **120 min** | 12 | 360 | 72 | **$26.88** | -$4.99 | $0.075 |

*Assuming 20% send rate (1 out of 5 analyses results in a sent message)

**Key Insight**: The cost per additional check decreases as frequency increases because:
- Chat costs stay constant
- gpt-oss-120b is very cheap ($0.039/M input)
- Only pay full Sonnet cost when messages are actually sent

---

## Impact of Send Rate on Costs (30-minute interval)

The send rate (what % of analyses result in sending a message) significantly impacts costs:

| Send Rate | Messages/Month | Sonnet Proactive Cost | Total Monthly Cost |
|-----------|----------------|----------------------|-------------------|
| 10% (low) | 144 | $14.69 | **$39.19** |
| **20% (assumed)** | **288** | **$29.38** | **$53.52** |
| 30% (high) | 432 | $44.07 | $67.85 |
| 50% (very high) | 720 | $73.45 | $97.23 |

**Conservative estimate**: Using 20% send rate is reasonable. As your system matures and learns what's valuable, the send rate might drop to 10-15%, reducing costs further.

---

## Alternative Model Options (30-minute intervals)

### Budget Option: GPT-5 Nano + DeepSeek V3.2
**Monthly Cost**: **$18.47/month** (65% savings!)

| Model | Proactive | Chat | **Total** |
|-------|-----------|------|-----------|
| GPT-5 Nano ($0.050/$0.400) | $4.10 | $0.43 | **$4.53** |
| DeepSeek V3.2 ($0.25/$0.38) | $9.36 | $4.58 | **$13.94** |
| **TOTAL** | | | **$18.47/month** |

**Tradeoffs**:
- ✅ 400K context on small model (vs 128K)
- ✅ Huge cost savings
- ⚠️ DeepSeek may not match Sonnet quality for medical insights
- 🧪 Worth testing!

### Premium Option: GPT-5 Nano + Sonnet 4.5
**Monthly Cost**: **$54.95/month**

| Model | Proactive | Chat | **Total** |
|-------|-----------|------|-----------|
| GPT-5 Nano ($0.050/$0.400) | $4.10 | $0.43 | **$4.53** |
| Sonnet 4.5 ($3/$15) | $29.38 | $20.70 | **$50.08** |
| **TOTAL** | | | **$54.95/month** |

**Benefits**:
- ✅ 400K context on small model (8x improvement!)
- ✅ Better tool calling with GPT-5 Nano
- ✅ Same synthesis quality (Sonnet 4.5)
- ✅ Only $1.43 more than current gpt-oss setup

---

## My Recommendation

### ✅ Switch to 30-Minute Intervals with Current Models
**New monthly cost**: $53.52/month (+$21.65)

**Why this is the right move**:

1. **Value is clear**: More frequent checks catch patterns earlier
2. **Cost is reasonable**: Only $0.74/day more than 90-minute
3. **Still well-optimized**: 25% cheaper than old 90-minute setup
4. **Scalable**: If send rate drops to 15%, cost drops to $46/month
5. **Quality maintained**: Still using Sonnet 4.5 for final messages

**To implement**:
```typescript
// In src/services/proactive-monitor.ts
private checkInterval: number = 30 * 60 * 1000; // 30 minutes
```

### 🧪 Optional: Test GPT-5 Nano + DeepSeek V3.2
**Monthly cost**: $18.47/month (save $35)

If you want to experiment with 65% cost savings:
```env
HYBRID_SMALL_PROVIDER=openrouter
HYBRID_SMALL_MODEL=openai/gpt-5-nano
HYBRID_LARGE_MODEL=deepseek/deepseek-v3.2
```

Run for a week and compare message quality. If acceptable, you save $420/year!

---

## Monitoring Actual Costs

Track your usage at: https://openrouter.ai/activity

**What to watch**:
- Actual send rate (may be lower than 20%)
- Token usage per analysis (may optimize over time)
- Message quality at different intervals

**Adjust if needed**:
- Send rate < 15%? Consider 15-minute intervals (still only ~$70/month)
- Costs higher than expected? Check send rate and token usage
- Quality concerns? Stick with Sonnet 4.5 for synthesis

---

## Cost History

| Date | Setup | Frequency | Monthly Cost | Notes |
|------|-------|-----------|--------------|-------|
| Feb 6, 2026 | gpt-oss + Sonnet | 90 min | **$31.87** | Optimized proactive flow ✅ |
| Feb 6, 2026 (proposed) | gpt-oss + Sonnet | 30 min | **$53.52** | 3x more checks, 68% more cost |
| Feb 4, 2026 | gpt-oss + Sonnet | 90 min | $71.04 | Before optimization |
| Jan 2026 | gpt-oss + Sonnet | 30 min | $170.35 | Before optimization |

**Progress**: Your optimization reduced 30-minute costs from $170.35 → $53.52 (69% savings!)

---

## Technical Details

### Proactive Flow Architecture

```
Every 30 minutes:
  ↓
[Phase 1: Analysis + Decision] ← gpt-oss-120b ($0.002/check)
  - Gather glucose data
  - Analyze patterns
  - Decide: SEND or DON'T_SEND
  ↓
IF decision = SEND (20% of time):
  ↓
[Phase 2: Final Synthesis] ← Sonnet 4.5 ($0.10/message)
  - Create polished message
  - Medical insights
  - Actionable recommendations
  ↓
[Send to user]
```

**Key optimization**: 80% of checks cost only $0.002, not $0.10!

### Token Usage Details

**Per Analysis (gpt-oss-120b)**:
- System prompt: 4k tokens
- Tool iteration 1: +6k tokens (input), 100 output
- Tool iteration 2: +6k tokens (input), 100 output
- Tool iteration 3: +6k tokens (input), 100 output
- Tool iteration 4: +6k tokens (input), 100 output
- Decision synthesis: 24k accumulated input, 200 output
- **Average: 52k input, 600 output**

**Per Message (Sonnet 4.5, only if sending)**:
- Context summary: 20k tokens
- Tool results: 10k tokens
- Synthesis output: 800 tokens
- **Average: 30k input, 800 output**

**Chat (per conversation)**:
- Small model: 30k input, 200 output
- Large model: 20k input, 600 output

---

## Conclusion

**Current Recommendation**: Switch to 30-minute intervals at $53.52/month

**Why**:
✅ 3x more responsive monitoring
✅ Still 25% cheaper than old setup
✅ Cost per check is very low ($0.037)
✅ Quality maintained with Sonnet 4.5
✅ Can always dial back to 60 or 90 min if needed

**Future optimization**: Test GPT-5 Nano + DeepSeek V3.2 to potentially save 65% more while maintaining large context windows.

---

*Last updated: February 6, 2026*
