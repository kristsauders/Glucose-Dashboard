/**
 * Test Utilities
 * Common functions for testing
 */

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

export interface TestSuite {
  name: string;
  tests: TestResult[];
  totalDuration: number;
}

/**
 * Run a test and capture result
 */
export async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<TestResult> {
  const startTime = Date.now();
  try {
    await testFn();
    const duration = Date.now() - startTime;
    return { name, passed: true, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      name,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Assert that a condition is true
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Assert that a value is defined
 */
export function assertDefined<T>(value: T | undefined | null, message: string): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(`Assertion failed: ${message} (value is ${value})`);
  }
}

/**
 * Assert that a value is truthy
 */
export function assertTruthy(value: any, message: string): void {
  if (!value) {
    throw new Error(`Assertion failed: ${message} (value is ${value})`);
  }
}

/**
 * Assert that two values are equal
 */
export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (expected ${expected}, got ${actual})`);
  }
}

/**
 * Assert that a value contains no NaN or Infinity
 */
export function assertNoInvalidNumbers(obj: any, message: string): void {
  const str = JSON.stringify(obj);
  if (str.includes('NaN') || str.includes('Infinity')) {
    throw new Error(`Assertion failed: ${message} (contains NaN or Infinity)`);
  }
}

/**
 * Print test results
 */
export function printTestResults(suite: TestSuite): void {
  const passed = suite.tests.filter(t => t.passed).length;
  const failed = suite.tests.filter(t => !t.passed).length;
  const total = suite.tests.length;

  console.log('\n' + '='.repeat(80));
  console.log(`${suite.name}`);
  console.log('='.repeat(80));

  suite.tests.forEach(test => {
    const status = test.passed ? '✓' : '✗';
    const duration = `${test.duration}ms`;
    console.log(`  ${status} ${test.name} (${duration})`);
    if (test.error) {
      console.log(`    Error: ${test.error}`);
    }
  });

  console.log('');
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  console.log(`Total duration: ${suite.totalDuration}ms`);
  console.log('='.repeat(80) + '\n');
}

/**
 * Get test user from database
 */
export async function getTestUser(query: any): Promise<{
  id: string;
  email: string;
  timezone: string;
}> {
  const result = await query('SELECT id, email, timezone FROM users LIMIT 1', []);
  if (result.rows.length === 0) {
    throw new Error('No test user found in database');
  }
  return {
    id: result.rows[0].id,
    email: result.rows[0].email,
    timezone: result.rows[0].timezone || 'America/New_York',
  };
}
