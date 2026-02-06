/**
 * Test Suite: API Endpoints
 * Tests critical API endpoints
 */

import { query } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import {
  runTest,
  TestResult,
  TestSuite,
  assert,
  assertDefined,
  assertTruthy,
  getTestUser,
} from './test-utils.js';

/**
 * Make HTTP request to API
 */
async function fetchAPI(path: string, options?: RequestInit): Promise<Response> {
  const baseUrl = `http://localhost:${env.PORT}`;
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  return response;
}

export async function testAPI(): Promise<TestSuite> {
  const suiteStartTime = Date.now();
  const tests: TestResult[] = [];

  // Test 1: Health check endpoint
  tests.push(
    await runTest('GET /api/health', async () => {
      const response = await fetchAPI('/api/health');
      assert(response.ok, `Health check should return 200 (got ${response.status})`);

      const data = await response.json();
      assertDefined(data.status, 'Health check should have status');
      assert(data.status === 'ok', 'Health check status should be "ok"');
      assertDefined(data.database, 'Health check should include database status');
    })
  );

  // Test 2: VAPID public key endpoint
  tests.push(
    await runTest('GET /api/notifications/vapid-public-key', async () => {
      const response = await fetchAPI('/api/notifications/vapid-public-key');
      assert(response.ok, `VAPID endpoint should return 200 (got ${response.status})`);

      const data = await response.json();
      assertDefined(data.publicKey, 'Should return VAPID public key');
      assertTruthy(data.publicKey.length > 0, 'VAPID public key should not be empty');
    })
  );

  // Test 3: Auth endpoint (should fail without credentials)
  tests.push(
    await runTest('POST /api/auth/login (no credentials)', async () => {
      const response = await fetchAPI('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
      });

      assert(response.status === 401, `Login with wrong creds should return 401 (got ${response.status})`);
    })
  );

  // Test 4: Protected endpoint without auth (should fail)
  tests.push(
    await runTest('GET /api/glucose/recent (no auth)', async () => {
      const response = await fetchAPI('/api/glucose/recent?hours=24');
      assert(
        response.status === 401 || response.status === 403,
        `Protected endpoint without auth should return 401/403 (got ${response.status})`
      );
    })
  );

  // Test 5: Get auth token and test protected endpoint
  tests.push(
    await runTest('GET /api/glucose/recent (with auth)', async () => {
      // Get user credentials from database
      const user = await getTestUser(query);

      // For testing, we'll create a token manually
      // In production, you'd login through the API
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '1h' });

      const response = await fetchAPI('/api/glucose/recent?hours=24', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      assert(response.ok, `Authenticated request should succeed (got ${response.status})`);

      const data = await response.json();
      assertDefined(data.readings, 'Should return readings array');
      assert(Array.isArray(data.readings), 'Readings should be an array');
    })
  );

  // Test 6: Conversations endpoint
  tests.push(
    await runTest('GET /api/conversations (with auth)', async () => {
      const user = await getTestUser(query);
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '1h' });

      const response = await fetchAPI('/api/conversations', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      assert(response.ok, `Conversations endpoint should succeed (got ${response.status})`);

      const data = await response.json();
      assert(Array.isArray(data), 'Should return conversations array');
    })
  );

  // Test 7: Settings endpoint
  tests.push(
    await runTest('GET /api/settings (with auth)', async () => {
      const user = await getTestUser(query);
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '1h' });

      const response = await fetchAPI('/api/settings', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      assert(response.ok, `Settings endpoint should succeed (got ${response.status})`);

      const data = await response.json();
      assertDefined(data.user, 'Should return user settings');
    })
  );

  const totalDuration = Date.now() - suiteStartTime;
  return { name: 'API Endpoints', tests, totalDuration };
}
