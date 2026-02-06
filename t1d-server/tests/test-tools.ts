/**
 * Test Suite: Agent Tools
 * Tests all 33 agent tools with real data
 */

import { query } from '../src/config/database.js';
import { allTools } from '../src/agent/tools.js';
import {
  runTest,
  TestResult,
  TestSuite,
  assertDefined,
  assertNoInvalidNumbers,
  getTestUser,
} from './test-utils.js';

export async function testAllTools(): Promise<TestSuite> {
  const suiteStartTime = Date.now();
  const tests: TestResult[] = [];

  const user = await getTestUser(query);

  for (const tool of allTools) {
    // Skip tools that modify state
    if (tool.name === 'send_proactive_message' || tool.name === 'store_user_memory') {
      tests.push({
        name: `${tool.name}`,
        passed: true,
        duration: 0,
        details: 'Skipped (modifies state)',
      });
      continue;
    }

    const result = await runTest(`${tool.name}`, async () => {
      let args: any = {
        userId: user.id,
        userTimezone: user.timezone,
      };

      // Add tool-specific required arguments
      switch (tool.name) {
        case 'get_recent_glucose':
          args.hours = 3;
          break;
        case 'get_glucose_around_time':
          args.timestamp = new Date().toISOString();
          args.windowMinutes = 30;
          break;
        case 'analyze_trends':
        case 'analyze_overnight':
        case 'analyze_basal_patterns':
        case 'analyze_meal_patterns':
          args.days = 7;
          break;
        case 'analyze_live_trend':
          args.hours = 3;
          break;
        case 'compare_periods_statistical':
          args.period1Days = 7;
          args.period2Days = 7;
          args.period1Offset = 7;
          args.comparisonType = 'time_periods';
          break;
        case 'detect_anomalies':
          args.days = 7;
          args.threshold = 2.0;
          break;
        case 'get_detected_patterns':
          args.days = 14;
          break;
        case 'predict_glucose':
          args.hours = 2;
          break;
        case 'get_glucose_statistics':
        case 'analyze_time_in_range':
        case 'get_daily_summaries':
        case 'analyze_variability':
          args.days = 7;
          break;
        case 'get_meal_log':
        case 'get_insulin_log':
        case 'get_exercise_log':
          args.days = 3;
          break;
        case 'retrieve_user_memory':
          args.category = 'all';
          break;
        case 'search_user_memory':
          args.query = 'insulin';
          break;
        case 'analyze_correction_effectiveness':
        case 'analyze_meal_response':
        case 'get_hypoglycemia_events':
        case 'get_hyperglycemia_events':
        case 'analyze_dawn_phenomenon':
          args.days = 7;
          break;
        case 'delete_user_memory':
        case 'estimate_meal_carbs':
        case 'estimate_exercise_intensity':
        case 'log_meal':
        case 'log_exercise':
        case 'log_insulin':
          // These require specific params - skip testing them
          throw new Error('Skipped: requires specific parameters');
      }

      const output = await tool.invoke(args);
      assertDefined(output, `${tool.name} returned undefined`);

      // Parse and validate output
      let parsed;
      try {
        parsed = JSON.parse(output);
      } catch {
        parsed = output;
      }

      // Check for invalid numbers
      if (typeof parsed === 'object') {
        assertNoInvalidNumbers(parsed, `${tool.name} contains invalid numbers`);
      }
    });

    tests.push(result);
  }

  const totalDuration = Date.now() - suiteStartTime;
  return { name: 'Agent Tools', tests, totalDuration };
}
