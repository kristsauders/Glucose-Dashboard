#!/usr/bin/env node

/**
 * Find glucose readings in a time range to help identify bad sensor data
 * Usage: node scripts/find-readings.js
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('=== Find Glucose Readings ===\n');

    // Get all readings from January 16-17, 2025 (both 2024 and 2025 to be safe)
    const result = await pool.query(
      `SELECT
        id,
        timestamp,
        timestamp AT TIME ZONE 'America/New_York' as local_time,
        glucose,
        source,
        DATE(timestamp AT TIME ZONE 'America/New_York') as local_date
       FROM glucose_readings
       WHERE (timestamp AT TIME ZONE 'America/New_York')::date IN ('2024-01-16', '2024-01-17', '2025-01-16', '2025-01-17')
       ORDER BY timestamp ASC`
    );

    if (result.rows.length === 0) {
      console.log('No readings found on January 16-17 (checked both 2024 and 2025).');
      await pool.end();
      return;
    }

    console.log(`Found ${result.rows.length} readings on January 16-17:\n`);

    // Group by date
    const byDate = {};
    for (const row of result.rows) {
      const date = row.local_date;
      if (!byDate[date]) {
        byDate[date] = [];
      }
      byDate[date].push(row);
    }

    // Display by date
    for (const [date, readings] of Object.entries(byDate)) {
      console.log(`\n━━━ ${date} (${readings.length} readings) ━━━\n`);
      console.log('┌──────────┬─────────┬──────────┐');
      console.log('│ Time     │ Glucose │ Source   │');
      console.log('├──────────┼─────────┼──────────┤');

      for (const row of readings) {
        const time = new Date(row.local_time).toLocaleTimeString('en-US', {
          timeZone: 'America/New_York',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        const glucose = row.glucose.toString().padEnd(7);
        const source = (row.source || 'N/A').padEnd(8);
        console.log(`│ ${time.padEnd(8)} │ ${glucose} │ ${source} │`);
      }
      console.log('└──────────┴─────────┴──────────┘');

      // Show stats for this day
      const glucoseValues = readings.map(r => parseFloat(r.glucose));
      const avg = glucoseValues.reduce((a, b) => a + b, 0) / glucoseValues.length;
      const min = Math.min(...glucoseValues);
      const max = Math.max(...glucoseValues);
      console.log(`\nStats: Avg=${avg.toFixed(1)}, Min=${min}, Max=${max}`);
    }

    console.log('\n\nTo delete a specific time range, look at the times above and update');
    console.log('the START_TIME and END_TIME in remove-bad-readings.js');
    console.log('\nExample format: "2025-01-16 22:55:00" or "2024-01-16 22:55:00"');

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

main();
