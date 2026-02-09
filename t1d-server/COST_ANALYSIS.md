# T1D AI Assistant - Cost Analysis (Updated Feb 2026)

## Current Configuration

**Models**:
- Small (analysis): gpt-oss-120b ($0.039/$0.195 per 1M tokens, 128K context)
- Large (synthesis): GLM-4.7 ($0.40/$1.50 per 1M tokens, 203K context)

**Proactive Frequency**: Every 90 minutes (16 checks/day)

**Usage Assumptions**:
- Proactive checks: 16/day × 30 days = 480 analyses/month
- Send rate: 20% (96 proactive messages sent/month)
- Chat usage: 10/day × 30 days = 300 chats/month

---

## Single User Costs (90-Minute Intervals)

### Proactive Monitoring (480 analyses, 96 messages sent)

**Analysis Phase** (all 480 checks):
| Component | Input Tokens | Output Tokens | Cost |
|-----------|--------------|---------------|------|
| gpt-oss-120b | 24.96M | 288k | $1.03 |

**Synthesis Phase** (96 messages sent):
| Component | Input Tokens | Output Tokens | Cost |
|-----------|--------------|---------------|------|
| GLM-4.7 | 8.64M | 76.8k | $3.57 |

**Proactive Subtotal**: $4.60/month

### Chat Usage (300 conversations)

| Component | Input Tokens | Output Tokens | Cost |
|-----------|--------------|---------------|------|
| gpt-oss-120b | 9M | 60k | $0.36 |
| GLM-4.7 | 6M | 180k | $2.67 |

**Chat Subtotal**: $3.03/month

### Single User Total

| Category | Monthly Cost |
|----------|--------------|
| Proactive Monitoring | $4.60 |
| Chat | $3.03 |
| **Total per User** | **$7.63** |

---

## Multi-User Deployment Costs

### Infrastructure (Shared)

**Platform**: DigitalOcean

**Components**:
- App Platform (frontend + backend): $12/month
- PostgreSQL Database (1GB): $15/month
- Spaces Storage (optional): $5/month
- **Infrastructure Subtotal**: $32/month

Scales to 50-75 users before needing upgrades.

### Total Monthly Costs by User Count

| Users | AI Costs | Infrastructure | **Total** | **Cost/User** | **Savings/User** |
|-------|----------|----------------|-----------|---------------|------------------|
| 1 | $7.63 | $32 | **$39.63** | $39.63 | - |
| 5 | $38.15 | $32 | **$70.15** | $14.03 | 65% |
| 10 | $76.30 | $32 | **$108.30** | $10.83 | 73% |
| 25 | $190.75 | $32 | **$222.75** | $8.91 | 78% |
| 50 | $381.50 | $32 | **$413.50** | $8.27 | 79% |
| 75 | $572.25 | $32 | **$604.25** | $8.06 | 80% |
| 100 | $763.00 | $64* | **$827.00** | $8.27 | 79% |

*Need infrastructure upgrade at ~75-100 users

---

## Infrastructure Scaling

### Phase 1: Starter (1-50 users)
**Cost**: $32/month

- App Platform Basic: $12/month
- PostgreSQL 1GB: $15/month
- Spaces Storage: $5/month
- **Capacity**: ~50 users comfortably

### Phase 2: Growth (50-150 users)
**Cost**: $64/month

- App Platform Professional: $24/month
- PostgreSQL 2GB: $30/month
- Spaces Storage: $5/month
- Redis cache: $5/month
- **Capacity**: ~150 users

### Phase 3: Scale (150-500 users)
**Cost**: $140/month

- App Platform (2 containers): $48/month
- PostgreSQL 4GB: $60/month
- Redis 1GB: $15/month
- Spaces: $5/month
- Load Balancer: $12/month
- **Capacity**: ~500 users

---

## Cost Breakdown by Component

### Per User Monthly Costs

| Component | Cost | % of Total |
|-----------|------|------------|
| GLM-4.7 (synthesis) | $3.57 | 47% |
| GLM-4.7 (chat) | $2.67 | 35% |
| gpt-oss-120b (analysis) | $1.03 | 13% |
| gpt-oss-120b (chat) | $0.36 | 5% |
| **Total AI** | **$7.63** | **100%** |

**Key Insight**: 82% of cost is the large model (GLM-4.7), mostly for chat interactions.

---

## Cost Optimization Opportunities

### 1. Reduce Chat Frequency
**Impact**: -$2.67/user/month (-35%)

If users chat 5x/day instead of 10x/day:
- New cost: $4.96/user/month
- Savings: $2.67/user/month

### 2. Lower Proactive Send Rate
**Impact**: -$1.79/user/month (-23%)

If send rate drops to 10% (smarter filtering):
- New cost: $5.84/user/month
- Savings: $1.79/user/month

### 3. Increase Proactive Interval
**Impact**: -$1.54/user/month (-20%)

If checking every 2 hours instead of 90 minutes:
- New cost: $6.09/user/month
- Savings: $1.54/user/month

### Combined Optimizations
All three optimizations together:
- New cost: $2.56/user/month
- Savings: $5.07/user/month (66% reduction!)

---

## Alternative Proactive Intervals

Cost per user at different check frequencies:

| Interval | Checks/Day | Analyses/Month | Messages/Month | AI Cost/User | vs 90-min |
|----------|------------|----------------|----------------|--------------|-----------|
| **90 min** | 16 | 480 | 96 | **$7.63** | baseline |
| 120 min (2h) | 12 | 360 | 72 | **$6.09** | -$1.54 |
| 180 min (3h) | 8 | 240 | 48 | **$4.55** | -$3.08 |

**Note**: Chat costs ($3.03) remain constant across intervals.

---

## Model Comparison (90-Minute Intervals)

If you want to try different large models:

| Large Model | Input $/1M | Output $/1M | Cost/User | vs GLM-4.7 |
|-------------|------------|-------------|-----------|------------|
| **GLM-4.7** | $0.40 | $1.50 | **$7.63** | baseline |
| Gemini 3 Flash | $0.50 | $3.00 | **$9.48** | +$1.85 |
| Kimi K2.5 | $0.60 | $2.50 | **$9.20** | +$1.57 |
| GPT-5.2 | $1.75 | $14.00 | **$18.30** | +$10.67 |
| Sonnet 4.5 | $3.00 | $15.00 | **$21.21** | +$13.58 |

All use gpt-oss-120b for analysis phase.

**Why GLM-4.7 wins**: Cheapest while maintaining quality and large context (203K).

---

## Real-World Cost Examples

### Scenario 1: Just You
- Users: 1
- Monthly cost: $39.63
- What you get: Full AI assistant with proactive monitoring

### Scenario 2: Close Friends/Family (5 users)
- Users: 5
- Monthly cost: $70.15 ($14.03/user)
- What you get: Help 5 people manage their T1D

### Scenario 3: Small Community (25 users)
- Users: 25
- Monthly cost: $222.75 ($8.91/user)
- What you get: Meaningful impact, sustainable costs

### Scenario 4: Growing Community (100 users)
- Users: 100
- Monthly cost: $827 ($8.27/user)
- What you get: Real community platform, costs scale well

---

## Cost vs User Count (Visual Reference)

```
Cost per User (with infrastructure):
$40 |●
$30 |
$20 |
$15 |  ●
$10 |    ●        ● ● ●
 $8 |
    |________________________
      1  5  10    25 50 100
               Users

Total Monthly Cost:
$827|                      ●
$600|
$400|                  ●
$200|              ●
$100|        ●
    |  ●  ●
    |________________________
      1  5  10  25 50 100
               Users
```

**Key Insight**: Per-user cost drops rapidly from 1→10 users due to shared infrastructure, then stabilizes around $8/user.

---

## Deployment Checklist

### Initial Setup
- [ ] Create DigitalOcean account
- [ ] Set up App Platform (connect GitHub repo)
- [ ] Provision PostgreSQL database
- [ ] Configure environment variables
- [ ] Set up custom domain + SSL
- [ ] Enable automated backups

### Multi-User Features
- [ ] Update database schema for multi-tenancy
- [ ] Per-user usage tracking
- [ ] User authentication hardening
- [ ] Admin dashboard for monitoring
- [ ] Data export functionality
- [ ] User onboarding flow

### Monitoring
- [ ] Set up cost alerts (OpenRouter)
- [ ] Database performance monitoring
- [ ] Error tracking (Sentry or similar)
- [ ] Uptime monitoring
- [ ] Weekly cost reports

---

## Cost Tracking

**Monitor these metrics**:
1. **Actual send rate**: May be lower than 20%
2. **Chats per user per day**: May vary by user
3. **Token usage**: May decrease as system optimizes
4. **Infrastructure load**: Plan upgrades before limits

**Where to track**:
- AI costs: https://openrouter.ai/activity
- Infrastructure: DigitalOcean dashboard
- Per-user metrics: Build admin dashboard

---

## Summary

### Current Setup (1 User)
- **Monthly cost**: $39.63
- **Models**: gpt-oss-120b + GLM-4.7
- **Interval**: 90 minutes
- **Cost breakdown**: $7.63 AI + $32 infrastructure

### At Scale (25 Users)
- **Monthly cost**: $222.75
- **Cost per user**: $8.91
- **Savings vs solo**: 78% per user
- **Infrastructure**: Same $32 shared cost

### At Scale (100 Users)
- **Monthly cost**: $827
- **Cost per user**: $8.27
- **Infrastructure**: $64 (upgraded)
- **Sustainable**: Yes, costs scale linearly

### Bottom Line
- **Solo use**: ~$40/month (very affordable)
- **Community use**: ~$8-9/user/month at scale
- **Best model choice**: GLM-4.7 (proven in your testing)
- **Proactive interval**: 90 minutes (balanced)

---

## Sources

**Model Pricing**:
- [GLM-4.7 Pricing](https://pricepertoken.com/pricing-page/model/z-ai-glm-4.7)
- [gpt-oss-120b on OpenRouter](https://openrouter.ai/models/gpt-oss-120b)

**Hosting**:
- [DigitalOcean Pricing](https://www.digitalocean.com/pricing)
- [DigitalOcean vs AWS Comparison](https://www.digitalocean.com/resources/articles/digitalocean-vs-awslightsail)

---

*Last updated: February 9, 2026*
*Current configuration: gpt-oss-120b + GLM-4.7 @ 90-minute intervals*
