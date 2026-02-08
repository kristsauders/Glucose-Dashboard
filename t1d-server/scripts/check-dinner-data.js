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

async function checkDinnerData() {
  try {
    // Get recent dinner meals
    const mealsResult = await pool.query(`
      SELECT
        m.id,
        m.timestamp,
        m.description,
        m.carbs,
        m.correlation_id,
        m.user_id,
        c.baseline_glucose,
        c.peak_glucose,
        c.time_to_peak_minutes,
        c.total_change,
        c.time_in_range_pct
      FROM meals m
      LEFT JOIN glucose_correlations c ON m.correlation_id = c.id
      WHERE m.meal_type = 'dinner'
        AND m.timestamp >= NOW() - INTERVAL '3 days'
      ORDER BY m.timestamp DESC
      LIMIT 5
    `);

    console.log(`Found ${mealsResult.rows.length} recent dinner meals:\n`);

    for (const meal of mealsResult.rows) {
      console.log(`Meal ID: ${meal.id}`);
      console.log(`  Time: ${meal.timestamp}`);
      console.log(`  Description: ${meal.description}`);
      console.log(`  Carbs: ${meal.carbs}g`);
      console.log(`  Has correlation: ${!!meal.correlation_id}`);

      if (meal.correlation_id) {
        console.log(`  Stored peak: ${meal.peak_glucose} mg/dL`);

        // Check actual glucose data
        const mealTime = new Date(meal.timestamp);
        const threeHoursLater = new Date(mealTime.getTime() + (3 * 60 * 60 * 1000));

        const glucoseResult = await pool.query(`
          SELECT timestamp, glucose
          FROM glucose_readings
          WHERE user_id = $1
            AND timestamp >= $2
            AND timestamp <= $3
          ORDER BY timestamp ASC
        `, [meal.user_id, meal.timestamp, threeHoursLater.toISOString()]);

        if (glucoseResult.rows.length === 0) {
          console.log(`  ⚠️  NO GLUCOSE DATA in 3-hour window!`);
        } else {
          const actualPeak = Math.max(...glucoseResult.rows.map(r => r.glucose));
          console.log(`  Actual peak: ${actualPeak} mg/dL (${glucoseResult.rows.length} readings)`);

          if (actualPeak !== parseFloat(meal.peak_glucose)) {
            console.log(`  ❌ MISMATCH! Stored: ${meal.peak_glucose}, Actual: ${actualPeak}`);
          }
        }
      }
      console.log();
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkDinnerData();
