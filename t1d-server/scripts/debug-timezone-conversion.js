import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testTimezoneConversion() {
  try {
    console.log('Testing timezone conversions...\n');

    const userTimezone = 'America/New_York';
    const localTimeStr = '2026-02-08T08:15:00'; // 8:15 AM local time

    console.log(`Input: ${localTimeStr} (${userTimezone})`);
    console.log(`Expected UTC: 2026-02-08T13:15:00.000Z (8:15 AM EST = 1:15 PM UTC)\n`);

    // Test OLD (broken) meal logging conversion
    console.log('=== OLD (broken) conversion ===');
    const oldResult = await pool.query(
      `SELECT timezone('UTC', timezone($1, $2::timestamp)) as utc_time`,
      [userTimezone, localTimeStr]
    );
    console.log(`Result: ${oldResult.rows[0].utc_time.toISOString()}`);
    console.log(`Is correct: ${oldResult.rows[0].utc_time.toISOString() === '2026-02-08T13:15:00.000Z' ? 'YES ✓' : 'NO ✗'}\n`);

    // Test NEW (fixed) conversion
    console.log('=== NEW (fixed) conversion ===');
    const newResult = await pool.query(
      `SELECT ($2::timestamp AT TIME ZONE $1) as utc_time`,
      [userTimezone, localTimeStr]
    );
    console.log(`Result: ${newResult.rows[0].utc_time.toISOString()}`);
    console.log(`Is correct: ${newResult.rows[0].utc_time.toISOString() === '2026-02-08T13:15:00.000Z' ? 'YES ✓' : 'NO ✗'}\n`);

    // Check recent meals logged via agent
    console.log('=== Recent meals logged via agent ===');
    const mealsResult = await pool.query(
      `SELECT
        id,
        timestamp,
        timestamp AT TIME ZONE 'America/New_York' as local_time,
        description,
        meal_type,
        created_at
      FROM meals
      WHERE source = 'agent'
      ORDER BY created_at DESC
      LIMIT 3`
    );

    if (mealsResult.rows.length === 0) {
      console.log('No meals logged via agent found');
    } else {
      mealsResult.rows.forEach(meal => {
        console.log(`\nMeal: ${meal.description} (${meal.meal_type || 'no type'})`);
        console.log(`  Stored timestamp (UTC): ${meal.timestamp}`);
        console.log(`  Local time (converted):  ${meal.local_time}`);
        console.log(`  Created at: ${meal.created_at}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testTimezoneConversion();
