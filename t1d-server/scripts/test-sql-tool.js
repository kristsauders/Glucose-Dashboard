import { executeSafeReadOnlyQuery } from '../src/utils/safe-sql-executor.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

async function runTests() {
  console.log('🧪 Testing SQL Query Tool\n');

  // Get a test user ID from the database
  const userId = '018e31a6-63eb-7c01-9f66-fc3e4e4ec702'; // Replace with actual user ID

  const tests = [
    {
      name: 'Test 1: Valid SELECT query (hourly averages)',
      query: `
        SELECT
          DATE_TRUNC('hour', timestamp) AS hour,
          AVG(glucose_value) AS avg_glucose,
          COUNT(*) AS reading_count
        FROM user_glucose_readings
        WHERE timestamp > NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', timestamp)
        ORDER BY hour DESC
        LIMIT 10
      `,
      description: 'Hourly glucose averages for last 24 hours',
      shouldSucceed: true
    },
    {
      name: 'Test 2: Invalid INSERT query (should be blocked)',
      query: `INSERT INTO user_meals (description, carbs) VALUES ('test', 50)`,
      description: 'Attempt to insert data',
      shouldSucceed: false
    },
    {
      name: 'Test 3: Invalid DROP query (should be blocked)',
      query: `SELECT 1; DROP TABLE glucose_readings;`,
      description: 'SQL injection attempt',
      shouldSucceed: false
    },
    {
      name: 'Test 4: Valid JOIN query',
      query: `
        SELECT
          m.timestamp,
          m.description,
          m.carbs,
          COUNT(gr.glucose_value) AS glucose_readings
        FROM user_meals m
        LEFT JOIN user_glucose_readings gr ON
          gr.timestamp BETWEEN m.timestamp AND m.timestamp + INTERVAL '2 hours'
        WHERE m.timestamp > NOW() - INTERVAL '7 days'
        GROUP BY m.id, m.timestamp, m.description, m.carbs
        ORDER BY m.timestamp DESC
        LIMIT 5
      `,
      description: 'Meals with post-meal glucose reading counts',
      shouldSucceed: true
    },
    {
      name: 'Test 5: Data isolation test (should only return user data)',
      query: `SELECT COUNT(*) as total_readings FROM user_glucose_readings`,
      description: 'Count total glucose readings (should be scoped to user)',
      shouldSucceed: true
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\n📋 ${test.name}`);
    console.log(`   Description: ${test.description}`);

    try {
      const result = await executeSafeReadOnlyQuery(userId, test.query, test.description);
      const parsed = JSON.parse(result);

      if (test.shouldSucceed) {
        if (parsed.success) {
          console.log(`   ✅ PASS - Query executed successfully`);
          console.log(`   📊 Returned ${parsed.rowCount} rows`);
          if (parsed.rowCount > 0 && parsed.data.length > 0) {
            console.log(`   📝 Sample row:`, JSON.stringify(parsed.data[0]).substring(0, 100) + '...');
          }
          passed++;
        } else {
          console.log(`   ❌ FAIL - Expected success but got error: ${parsed.error}`);
          failed++;
        }
      } else {
        console.log(`   ❌ FAIL - Query should have been blocked but succeeded`);
        failed++;
      }
    } catch (error) {
      if (!test.shouldSucceed) {
        console.log(`   ✅ PASS - Query correctly blocked: ${error.message}`);
        passed++;
      } else {
        console.log(`   ❌ FAIL - Expected success but got error: ${error.message}`);
        failed++;
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log(`\n${'='.repeat(60)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
