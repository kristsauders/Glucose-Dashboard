# T1D Server Test Suite

Comprehensive test suite for the T1D AI Assistant server with real data and real AI calls.

## Quick Start

```bash
# Run all tests
npm run test

# Results will be printed to console and saved to test-results.log
```

## What Gets Tested

### 1. Database Tests
- Database connection
- User table queries
- Glucose readings (recent and historical)
- Conversations and messages
- User memories
- Glucose patterns (validates no NaN/Infinity values)
- Timezone-aware queries

### 2. Tool Tests (33 tools)
- All agent tools with real data
- Validates outputs are reasonable
- Checks for NaN/Infinity values
- Tests tool-specific logic

### 3. Agent Tests
- Simple questions with tool calls
- Multi-turn conversations
- Hybrid agent (small + large model)
- Verifies tool execution and synthesis

### 4. Proactive Monitor Tests
- Phase 1: Data gathering with tool-only agent
- Phase 2: Decision making with hybrid agent
- Cooldown checking
- Recent glucose data validation

### 5. API Tests (requires server running)
- Health check endpoint
- VAPID public key (for push notifications)
- Authentication endpoints
- Protected endpoints with/without auth
- Conversations and settings endpoints

## Requirements

- Database must be running and populated with data
- At least one user in the database
- Recent glucose data (last 24 hours)
- For API tests: Server must be running on port 3001

## Test Structure

```
tests/
├── run-tests.ts          # Main test runner
├── test-utils.ts         # Common utilities
├── test-database.ts      # Database tests
├── test-tools.ts         # Agent tool tests
├── test-agent.ts         # Agent graph tests
├── test-proactive.ts     # Proactive monitor tests
├── test-api.ts           # API endpoint tests
└── README.md            # This file
```

## Adding New Tests

### Add a test to an existing suite:

```typescript
tests.push(
  await runTest('Test name', async () => {
    // Your test code here
    assert(condition, 'Error message');
    assertDefined(value, 'Value should be defined');
  })
);
```

### Create a new test suite:

1. Create `test-<feature>.ts`
2. Export an async function that returns `TestSuite`
3. Add it to `run-tests.ts`

Example:

```typescript
import { runTest, TestResult, TestSuite } from './test-utils.js';

export async function testMyFeature(): Promise<TestSuite> {
  const suiteStartTime = Date.now();
  const tests: TestResult[] = [];

  tests.push(
    await runTest('My test', async () => {
      // Test code
    })
  );

  const totalDuration = Date.now() - suiteStartTime;
  return { name: 'My Feature', tests, totalDuration };
}
```

## Interpreting Results

### Exit Codes
- `0`: All tests passed
- `1`: Some tests failed

### Output
- `✓` = Test passed
- `✗` = Test failed
- `⊗` = Test skipped

### Log File
Results are saved to `test-results.log` in the parent directory for review.

## CI/CD Integration

Use in your deployment pipeline:

```bash
# Run tests before deploying
npm run test || exit 1

# If tests pass, proceed with deployment
npm run build
# ... deploy
```

## Troubleshooting

### "No test user found"
- Ensure database has at least one user
- Run `npm run db:setup` if needed

### "Should have recent glucose data"
- Ensure glucose readings exist in last 24 hours
- Import data or wait for LibreView sync

### "API tests skipped"
- Start server: `npm run dev`
- Tests will detect running server automatically

### "Agent tests timeout"
- Check AI provider configuration (.env)
- Ensure OPENROUTER_API_KEY or OLLAMA is configured
- Check network connection

## Performance

Typical test run takes 1-3 minutes depending on:
- Number of tools tested (33)
- AI model response time
- Database size
- Network latency

## Best Practices

1. **Run tests before deploying**: Catches breaking changes
2. **Review test-results.log**: Detailed logs for debugging
3. **Add tests for new features**: Keep coverage high
4. **Test with real data**: More reliable than mocks
5. **Monitor test duration**: Slow tests indicate problems

## Notes

- Tests use real AI calls (costs money/tokens)
- Tests do NOT modify user data (read-only except patterns)
- Some tests are skipped if prerequisites not met
- API tests require server to be running
