#!/usr/bin/env tsx
/**
 * Test script for the Python executor.
 * Usage: npx tsx scripts/test-python-executor.ts
 */
import { executePython } from '../src/services/python-executor.js';
import { pool } from '../src/config/database.js';

async function testExecutor() {
  console.log('🐍 Testing Python executor...\n');

  // Get first user
  const userRes = await pool.query('SELECT id, timezone FROM users LIMIT 1');
  if (userRes.rows.length === 0) {
    console.error('No users found in database');
    process.exit(1);
  }
  const { id: userId, timezone } = userRes.rows[0];
  console.log(`Using user: ${userId.slice(0, 8)}... timezone: ${timezone}\n`);

  // Test 1: Basic output
  console.log('── Test 1: Basic output ──');
  const r1 = await executePython(userId, timezone, `
print(f"Glucose readings loaded: {len(df_glucose)}")
print(f"Meals loaded: {len(df_meals)}")
print(f"Insulin doses loaded: {len(df_insulin)}")
print(f"Exercise sessions loaded: {len(df_exercise)}")
print(f"Sleep logs loaded: {len(df_sleep)}")
if not df_glucose.empty:
    print(f"Glucose range: {df_glucose['glucose'].min():.0f} - {df_glucose['glucose'].max():.0f} mg/dL")
    print(f"Date range: {df_glucose['timestamp'].min().date()} to {df_glucose['timestamp'].max().date()}")
`);
  console.log('Output:', r1.output);
  if (r1.error) console.error('Error:', r1.error);
  console.log(`Time: ${r1.executionMs}ms, Charts: ${r1.charts.length}\n`);

  // Test 2: Statistics
  console.log('── Test 2: Statistical analysis ──');
  const r2 = await executePython(userId, timezone, `
if len(df_glucose) > 10:
    mean = df_glucose['glucose'].mean()
    std = df_glucose['glucose'].std()
    cv = (std / mean) * 100
    tir = ((df_glucose['glucose'] >= 70) & (df_glucose['glucose'] <= 180)).mean() * 100
    print(f"Mean glucose: {mean:.1f} mg/dL")
    print(f"Std dev: {std:.1f} mg/dL")
    print(f"CV: {cv:.1f}%")
    print(f"Time in range (70-180): {tir:.1f}%")
else:
    print("Not enough glucose data")
`);
  console.log('Output:', r2.output);
  if (r2.error) console.error('Error:', r2.error);
  console.log(`Time: ${r2.executionMs}ms\n`);

  // Test 3: Chart generation
  console.log('── Test 3: Chart generation ──');
  const r3 = await executePython(userId, timezone, `
# mdates is pre-loaded — no import needed
if len(df_glucose) > 0:
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(df_glucose['timestamp'], df_glucose['glucose'], linewidth=0.8, color='#3b82f6', alpha=0.8)
    ax.axhspan(70, 180, alpha=0.1, color='green', label='Target (70-180)')
    ax.axhline(70, color='orange', linewidth=0.5, linestyle='--', alpha=0.5)
    ax.axhline(180, color='orange', linewidth=0.5, linestyle='--', alpha=0.5)
    ax.set_ylabel('Glucose (mg/dL)')
    ax.set_title('Glucose Readings (last 60 days)')
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %d'))
    ax.xaxis.set_major_locator(mdates.WeekdayLocator(interval=1))
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    plt.show()
    print(f"Chart generated with {len(df_glucose)} readings")
else:
    print("No glucose data for chart")
`);
  console.log('Output:', r3.output);
  if (r3.error) console.error('Error:', r3.error);
  console.log(`Time: ${r3.executionMs}ms, Charts: ${r3.charts.length}`);
  if (r3.charts.length > 0) {
    console.log(`Chart size: ${Math.round(r3.charts[0].length / 1024)}KB base64`);
  }

  // Test 4: Security — should fail gracefully
  console.log('\n── Test 4: Security test (restricted builtins) ──');
  const r4 = await executePython(userId, timezone, `
try:
    import os
    print("SECURITY FAIL: os imported")
except:
    print("PASS: os import blocked")
try:
    open('/etc/passwd')
    print("SECURITY FAIL: file opened")
except:
    print("PASS: file access blocked")
`);
  console.log('Output:', r4.output);
  if (r4.error) console.error('Error:', r4.error);

  console.log('\n✅ Python executor tests complete');
  await pool.end();
}

testExecutor().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
