#!/usr/bin/env node

/**
 * Remove bad glucose readings from a malfunctioning sensor
 * Usage: node scripts/remove-bad-readings.js
 */

import pg from 'pg';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

// Time range for bad readings (user's local time in America/New_York)
const START_TIME = '2026-01-16 22:55:00'; // 10:55 PM on Jan 16
const END_TIME = '2026-01-17 12:41:00';   // 12:41 PM on Jan 17
const TIMEZONE = 'America/New_York';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  // Create database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('=== Remove Bad Sensor Readings ===\n');
    console.log(`Time range (${TIMEZONE}):`);
    console.log(`  From: ${START_TIME}`);
    console.log(`  To:   ${END_TIME}`);
    console.log('');

    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✓ Connected to database\n');

    // First, show what will be deleted
    const previewResult = await pool.query(
      `SELECT
        id,
        timestamp AT TIME ZONE $3 as local_time,
        glucose,
        source
       FROM glucose_readings
       WHERE timestamp >= ($1::timestamp AT TIME ZONE $3)
         AND timestamp <= ($2::timestamp AT TIME ZONE $3)
       ORDER BY timestamp ASC`,
      [START_TIME, END_TIME, TIMEZONE]
    );

    if (previewResult.rows.length === 0) {
      console.log('No readings found in this time range.');
      rl.close();
      await pool.end();
      return;
    }

    console.log(`Found ${previewResult.rows.length} readings to delete:\n`);
    console.log('┌─────────────────────┬─────────┬──────────┐');
    console.log('│ Local Time          │ Glucose │ Source   │');
    console.log('├─────────────────────┼─────────┼──────────┤');

    for (const row of previewResult.rows) {
      const time = new Date(row.local_time).toLocaleString('en-US', {
        timeZone: TIMEZONE,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const glucose = row.glucose.toString().padEnd(7);
      const source = (row.source || 'N/A').padEnd(8);
      console.log(`│ ${time.padEnd(19)} │ ${glucose} │ ${source} │`);
    }
    console.log('└─────────────────────┴─────────┴──────────┘\n');

    // Calculate statistics
    const avgGlucose = previewResult.rows.reduce((sum, r) => sum + parseFloat(r.glucose), 0) / previewResult.rows.length;
    const minGlucose = Math.min(...previewResult.rows.map(r => parseFloat(r.glucose)));
    const maxGlucose = Math.max(...previewResult.rows.map(r => parseFloat(r.glucose)));

    console.log('Statistics for these readings:');
    console.log(`  Average: ${avgGlucose.toFixed(1)} mg/dL`);
    console.log(`  Min: ${minGlucose} mg/dL`);
    console.log(`  Max: ${maxGlucose} mg/dL`);
    console.log('');

    // Ask for confirmation
    const answer = await question('Do you want to DELETE these readings? (yes/no): ');

    if (answer.toLowerCase() !== 'yes') {
      console.log('\nCancelled. No readings were deleted.');
      rl.close();
      await pool.end();
      return;
    }

    // Delete the readings
    console.log('\nDeleting readings...');
    const deleteResult = await pool.query(
      `DELETE FROM glucose_readings
       WHERE timestamp >= ($1::timestamp AT TIME ZONE $3)
         AND timestamp <= ($2::timestamp AT TIME ZONE $3)
       RETURNING id`,
      [START_TIME, END_TIME, TIMEZONE]
    );

    console.log(`✓ Successfully deleted ${deleteResult.rowCount} readings`);
    console.log('\nYour glucose metrics will now be recalculated without these bad readings.');

    rl.close();
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    rl.close();
    await pool.end();
    process.exit(1);
  }
}

main();
