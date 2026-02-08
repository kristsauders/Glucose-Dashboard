import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function fixMealTypes() {
  try {
    console.log('Fixing meal types for existing meals...');

    const result = await pool.query(`
      UPDATE meals
      SET meal_type = CASE
        WHEN EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') >= 5
         AND EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') < 11 THEN 'breakfast'
        WHEN EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') >= 11
         AND EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') < 15 THEN 'lunch'
        WHEN EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') >= 15
         AND EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') < 21 THEN 'dinner'
        ELSE 'snack'
      END
      WHERE meal_type IS NULL
    `);

    console.log(`✓ Updated ${result.rowCount} meals with inferred meal_type`);

    // Show sample of updated meals
    const sample = await pool.query(`
      SELECT id, timestamp AT TIME ZONE 'America/New_York' as local_time, description, meal_type
      FROM meals
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    console.log('\nSample of updated meals:');
    sample.rows.forEach(row => {
      const timeStr = new Date(row.local_time).toLocaleString();
      console.log(`  - ${timeStr} | ${row.meal_type} | ${row.description}`);
    });

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error fixing meal types:', error);
    await pool.end();
    process.exit(1);
  }
}

fixMealTypes();
