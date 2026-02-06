/**
 * Main Test Runner
 * Runs all test suites and reports results
 */

import { testDatabase } from './test-database.js';
import { testAllTools } from './test-tools.js';
import { testAgent } from './test-agent.js';
import { testProactiveMonitor } from './test-proactive.js';
import { testAPI } from './test-api.js';
import { TestSuite, printTestResults } from './test-utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('T1D SERVER TEST SUITE');
  console.log('═'.repeat(80));
  console.log('');
  console.log('Running comprehensive tests with real data and AI calls...');
  console.log('This may take a few minutes.');
  console.log('');

  const startTime = Date.now();
  const suites: TestSuite[] = [];
  let hasFailures = false;

  // Check if server is running (for API tests)
  let serverRunning = false;
  try {
    const response = await fetch('http://localhost:3001/api/health');
    serverRunning = response.ok;
  } catch {
    serverRunning = false;
  }

  // Run test suites
  try {
    console.log('Running Database Tests...');
    const dbSuite = await testDatabase();
    suites.push(dbSuite);
    printTestResults(dbSuite);
    if (dbSuite.tests.some(t => !t.passed)) hasFailures = true;
  } catch (error) {
    console.error('❌ Database tests failed to run:', error);
    hasFailures = true;
  }

  try {
    console.log('Running Tool Tests...');
    const toolsSuite = await testAllTools();
    suites.push(toolsSuite);
    printTestResults(toolsSuite);
    if (toolsSuite.tests.some(t => !t.passed)) hasFailures = true;
  } catch (error) {
    console.error('❌ Tool tests failed to run:', error);
    hasFailures = true;
  }

  try {
    console.log('Running Agent Tests (with real AI calls)...');
    const agentSuite = await testAgent();
    suites.push(agentSuite);
    printTestResults(agentSuite);
    if (agentSuite.tests.some(t => !t.passed)) hasFailures = true;
  } catch (error) {
    console.error('❌ Agent tests failed to run:', error);
    hasFailures = true;
  }

  try {
    console.log('Running Proactive Monitor Tests...');
    const proactiveSuite = await testProactiveMonitor();
    suites.push(proactiveSuite);
    printTestResults(proactiveSuite);
    if (proactiveSuite.tests.some(t => !t.passed)) hasFailures = true;
  } catch (error) {
    console.error('❌ Proactive monitor tests failed to run:', error);
    hasFailures = true;
  }

  if (serverRunning) {
    try {
      console.log('Running API Tests...');
      const apiSuite = await testAPI();
      suites.push(apiSuite);
      printTestResults(apiSuite);
      if (apiSuite.tests.some(t => !t.passed)) hasFailures = true;
    } catch (error) {
      console.error('❌ API tests failed to run:', error);
      hasFailures = true;
    }
  } else {
    console.log('⊗ Skipping API tests (server not running on port 3001)');
    console.log('  Start the server with `npm run dev` to run API tests');
    console.log('');
  }

  // Overall summary
  const totalDuration = Date.now() - startTime;
  const totalTests = suites.reduce((sum, s) => sum + s.tests.length, 0);
  const totalPassed = suites.reduce((sum, s) => sum + s.tests.filter(t => t.passed).length, 0);
  const totalFailed = totalTests - totalPassed;

  console.log('═'.repeat(80));
  console.log('OVERALL SUMMARY');
  console.log('═'.repeat(80));
  console.log('');
  console.log(`Suites: ${suites.length}`);
  console.log(`Tests:  ${totalPassed}/${totalTests} passed, ${totalFailed} failed`);
  console.log(`Time:   ${(totalDuration / 1000).toFixed(1)}s`);
  console.log('');

  if (hasFailures) {
    console.log('❌ SOME TESTS FAILED');
    console.log('');
    console.log('Failed tests:');
    suites.forEach(suite => {
      const failed = suite.tests.filter(t => !t.passed);
      if (failed.length > 0) {
        console.log(`\n${suite.name}:`);
        failed.forEach(test => {
          console.log(`  ✗ ${test.name}`);
          if (test.error) {
            console.log(`    ${test.error}`);
          }
        });
      }
    });
  } else {
    console.log('✓ ALL TESTS PASSED');
  }

  console.log('');
  console.log('═'.repeat(80));
  console.log('');

  // Write results to log file
  const logPath = path.join(__dirname, '../test-results.log');
  const logContent = [
    '═'.repeat(80),
    'T1D SERVER TEST RESULTS',
    `Date: ${new Date().toISOString()}`,
    '═'.repeat(80),
    '',
    ...suites.map(suite => {
      const passed = suite.tests.filter(t => t.passed).length;
      const failed = suite.tests.filter(t => !t.passed).length;
      return [
        suite.name,
        '-'.repeat(80),
        `Results: ${passed}/${suite.tests.length} passed, ${failed} failed`,
        `Duration: ${suite.totalDuration}ms`,
        '',
        ...suite.tests.map(test => {
          const status = test.passed ? '✓' : '✗';
          const line = `  ${status} ${test.name} (${test.duration}ms)`;
          if (test.error) {
            return `${line}\n    Error: ${test.error}`;
          }
          return line;
        }),
        '',
      ].join('\n');
    }),
    '═'.repeat(80),
    `OVERALL: ${totalPassed}/${totalTests} passed, ${totalFailed} failed`,
    `Total time: ${(totalDuration / 1000).toFixed(1)}s`,
    hasFailures ? '❌ SOME TESTS FAILED' : '✓ ALL TESTS PASSED',
    '═'.repeat(80),
  ].join('\n');

  fs.writeFileSync(logPath, logContent);
  console.log(`Test results written to: ${logPath}`);
  console.log('');

  // Exit with appropriate code
  process.exit(hasFailures ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
