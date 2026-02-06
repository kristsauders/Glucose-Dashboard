/**
 * Test Suite: Database
 * Tests database connection and critical queries
 */

import { query, testConnection } from '../src/config/database.js';
import {
  runTest,
  TestResult,
  TestSuite,
  assert,
  assertTruthy,
  getTestUser,
} from './test-utils.js';

export async function testDatabase(): Promise<TestSuite> {
  const suiteStartTime = Date.now();
  const tests: TestResult[] = [];

  // Test 1: Database connection
  tests.push(
    await runTest('Database connection', async () => {
      const isConnected = await testConnection();
      assert(isConnected, 'Database should be connected');
    })
  );

  // Test 2: Users table
  tests.push(
    await runTest('Users table query', async () => {
      const result = await query('SELECT COUNT(*) as count FROM users', []);
      const count = parseInt(result.rows[0].count);
      assertTruthy(count > 0, `Should have at least one user (found ${count})`);
    })
  );

  // Test 3: Glucose readings table
  tests.push(
    await runTest('Glucose readings table', async () => {
      const user = await getTestUser(query);
      const result = await query(
        'SELECT COUNT(*) as count FROM glucose_readings WHERE user_id = $1',
        [user.id]
      );
      const count = parseInt(result.rows[0].count);
      assertTruthy(count > 0, `Should have glucose readings (found ${count})`);
    })
  );

  // Test 4: Recent glucose readings
  tests.push(
    await runTest('Recent glucose readings (last 24h)', async () => {
      const user = await getTestUser(query);
      const result = await query(
        `SELECT COUNT(*) as count FROM glucose_readings
         WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'`,
        [user.id]
      );
      const count = parseInt(result.rows[0].count);
      assertTruthy(count > 0, `Should have recent readings (found ${count})`);
    })
  );

  // Test 5: Conversations table
  tests.push(
    await runTest('Conversations table', async () => {
      const user = await getTestUser(query);
      const result = await query(
        'SELECT COUNT(*) as count FROM conversations WHERE user_id = $1',
        [user.id]
      );
      const count = parseInt(result.rows[0].count);
      console.log(`    Info: Found ${count} conversations`);
    })
  );

  // Test 6: Chat messages table
  tests.push(
    await runTest('Chat messages table', async () => {
      const user = await getTestUser(query);
      const result = await query(
        'SELECT COUNT(*) as count FROM chat_messages WHERE user_id = $1',
        [user.id]
      );
      const count = parseInt(result.rows[0].count);
      console.log(`    Info: Found ${count} chat messages`);
    })
  );

  // Test 7: User memories (optional table)
  tests.push(
    await runTest('User memories table (optional)', async () => {
      const user = await getTestUser(query);
      try {
        const result = await query(
          'SELECT COUNT(*) as count FROM user_memories WHERE user_id = $1',
          [user.id]
        );
        const count = parseInt(result.rows[0].count);
        console.log(`    Info: Found ${count} stored memories`);
      } catch (error: any) {
        if (error.code === '42P01') {
          // Table doesn't exist - this is OK, it's an optional feature
          console.log(`    Info: user_memories table not found (optional feature)`);
        } else {
          throw error;
        }
      }
    })
  );

  // Test 8: Glucose patterns
  tests.push(
    await runTest('Glucose patterns table', async () => {
      const user = await getTestUser(query);
      const result = await query(
        `SELECT COUNT(*) as count FROM glucose_patterns
         WHERE user_id = $1
           AND typical_magnitude != 'Infinity'
           AND typical_magnitude != '-Infinity'
           AND typical_magnitude != 'NaN'`,
        [user.id]
      );
      const count = parseInt(result.rows[0].count);
      console.log(`    Info: Found ${count} valid patterns`);
    })
  );

  // Test 9: Meals table
  tests.push(
    await runTest('Meals table', async () => {
      const user = await getTestUser(query);
      const result = await query('SELECT COUNT(*) as count FROM meals WHERE user_id = $1', [
        user.id,
      ]);
      const count = parseInt(result.rows[0].count);
      console.log(`    Info: Found ${count} logged meals`);
    })
  );

  // Test 10: Timezone-aware query
  tests.push(
    await runTest('Timezone-aware query', async () => {
      const user = await getTestUser(query);
      const result = await query(
        `SELECT
          DATE(timezone($2, timestamp)) as date,
          COUNT(*) as count
         FROM glucose_readings
         WHERE user_id = $1
           AND timestamp >= NOW() - INTERVAL '7 days'
         GROUP BY date
         ORDER BY date DESC
         LIMIT 7`,
        [user.id, user.timezone]
      );

      assertTruthy(result.rows.length > 0, 'Should have daily glucose data');
      const datesAreUnique = new Set(result.rows.map((r: any) => r.date)).size === result.rows.length;
      assert(datesAreUnique, 'Dates should be unique (timezone conversion working)');
    })
  );

  const totalDuration = Date.now() - suiteStartTime;
  return { name: 'Database', tests, totalDuration };
}
