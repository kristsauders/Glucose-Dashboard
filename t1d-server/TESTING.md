# Testing Guide

## Quick Start

Run all tests before deploying:

```bash
npm run test
```

Expected runtime: 1-3 minutes

## What Gets Tested

### ✅ Database (10 tests)
- Connection health
- User and glucose data
- Conversations and messages
- Pattern detection
- Timezone handling

### ✅ Agent Tools (33 tests)
- All tools with real data
- Output validation (no NaN/Infinity)
- Data quality checks

### ✅ Agent Graph (3 tests)
- **Real AI calls with actual models**
- Single-turn conversations
- Multi-turn conversations
- Hybrid mode (small + large model)

### ✅ Proactive Monitor (4 tests)
- **Real AI analysis phases**
- Data gathering
- Decision making
- Cooldown logic
- Recent data checks

### ✅ API Endpoints (7 tests)
- Health checks
- Authentication
- Protected routes
- VAPID keys

## Understanding Results

### Exit Codes
- `0` = All critical tests passed ✓
- `1` = Some tests failed ✗

### Common "Failures"
Some failures are **expected** and safe to ignore:

1. **"Skipped: requires specific parameters"** (6 tools)
   - Normal - these tools need user input
   - Examples: `log_meal`, `estimate_meal_carbs`

2. **"user_memories table not found"** (optional feature)
   - Safe if you haven't migrated this feature yet

3. **"API tests skipped"** (server not running)
   - Start server with `npm run dev` to test APIs

### Real Failures
These require fixing:

- Database connection errors
- Tool returning NaN/Infinity
- Agent unable to call tools
- Timezone errors

## Before Deploying

```bash
# 1. Run tests
npm run test

# 2. Check results
cat test-results.log

# 3. If all critical tests pass (exit code 0), deploy
# If tests fail (exit code 1), fix issues first
```

## Test Results

Results are saved to:
- **Console**: Real-time output
- **test-results.log**: Detailed log file

## Adding Tests

See [tests/README.md](tests/README.md) for detailed documentation on:
- Test structure
- Adding new tests
- Test utilities
- Best practices

## CI/CD Integration

```bash
#!/bin/bash
# deploy.sh

# Run tests
npm run test
if [ $? -ne 0 ]; then
  echo "Tests failed! Aborting deployment."
  exit 1
fi

# Tests passed - proceed with deployment
echo "Tests passed! Deploying..."
# ... your deployment commands
```

## Performance

- Database tests: ~100ms
- Tool tests: ~400ms
- Agent tests: ~60s (real AI calls)
- Proactive tests: ~66s (real AI calls)
- API tests: ~200ms

**Total: ~2 minutes**

## Cost Considerations

Tests make **real AI API calls**:
- ~5-10 agent iterations per test run
- Estimated cost: $0.01-0.05 per run
- Use small models for tests to reduce cost

## Troubleshooting

### "No test user found"
```bash
npm run db:setup
```

### "Should have recent glucose data"
- Import data or wait for LibreView sync
- Or use test data

### "Agent tests timeout"
- Check AI provider config (.env)
- Verify OPENROUTER_API_KEY
- Check network connection

### "Database connection failed"
```bash
npm run docker:up
```

## Recommended Workflow

1. **Before starting work**
   ```bash
   npm run test  # Establish baseline
   ```

2. **During development**
   - Make changes
   - Run relevant tests
   - Fix issues

3. **Before committing**
   ```bash
   npm run test  # Final check
   ```

4. **Before deploying**
   ```bash
   npm run test  # Must pass
   ```

## Test Coverage

Current coverage:
- ✅ Database queries
- ✅ All 33 agent tools
- ✅ Agent graph (single + multi-turn)
- ✅ Proactive analysis (all 3 phases)
- ✅ API endpoints
- ✅ Timezone handling
- ✅ Pattern detection
- ✅ Data quality (no NaN/Infinity)

Not yet covered:
- LibreView polling
- Discord notifications
- WebSocket streaming
- Report generation

## Notes

- Tests use **real database** (not mocks)
- Tests make **real AI calls** (costs money)
- Tests are **read-only** (except pattern regeneration)
- Tests **automatically skip** if prerequisites missing
- Tests run in **~2 minutes** total

---

For detailed test documentation, see [tests/README.md](tests/README.md)
