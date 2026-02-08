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

const mealId = 'b1856b46-4cce-434c-81fc-1a406099adc9';

async function checkMealCorrelation() {
  try {
    // Get meal and correlation data
    const mealResult = await pool.query(`
      SELECT
        m.id,
        m.timestamp,
        m.description,
        m.carbs,
        m.correlation_id,
        c.baseline_glucose,
        c.peak_glucose,
        c.time_to_peak_minutes,
        c.total_change,
        c.time_in_range_pct
      FROM meals m
      LEFT JOIN glucose_correlations c ON m.correlation_id = c.id
      WHERE m.id = $1
    `, [mealId]);

    if (mealResult.rows.length === 0) {
      console.log('Meal not found!');
      return;
    }

    const meal = mealResult.rows[0];
    console.log('Meal data:');
    console.log(`  ID: ${meal.id}`);
    console.log(`  Time: ${meal.timestamp}`);
    console.log(`  Description: ${meal.description}`);
    console.log(`  Carbs: ${meal.carbs}g`);
    console.log(`  Has correlation: ${!!meal.correlation_id}`);

    if (meal.correlation_id) {
      console.log('\nStored correlation data:');
      console.log(`  Baseline: ${meal.baseline_glucose} mg/dL`);
      console.log(`  Peak: ${meal.peak_glucose} mg/dL`);
      console.log(`  Time to peak: ${meal.time_to_peak_minutes} min`);
      console.log(`  Total change: ${meal.total_change} mg/dL`);
      console.log(`  Time in range: ${meal.time_in_range_pct}%`);
    }

    // Check actual glucose readings in 3-hour window
    const mealTime = new Date(meal.timestamp);
    const threeHoursLater = new Date(mealTime.getTime() + (3 * 60 * 60 * 1000));

    const glucoseResult = await pool.query(`
      SELECT user_id, timestamp, glucose
      FROM glucose_readings
      WHERE user_id = (SELECT user_id FROM meals WHERE id = $1)
        AND timestamp >= $2
        AND timestamp <= $3
      ORDER BY timestamp ASC
    `, [mealId, meal.timestamp, threeHoursLater.toISOString()]);

    console.log(`\nActual glucose readings in 3-hour post-meal window (${glucoseResult.rows.length} readings):`);

    if (glucoseResult.rows.length === 0) {
      console.log('  ⚠️  NO GLUCOSE DATA FOUND in 3-hour window!');
    } else {
      glucoseResult.rows.forEach(r => {
        console.log(`  ${r.timestamp}: ${r.glucose} mg/dL`);
      });

      const actualPeak = Math.max(...glucoseResult.rows.map(r => r.glucose));
      console.log(`\n  📊 Actual peak in window: ${actualPeak} mg/dL`);

      if (meal.peak_glucose && actualPeak !== parseFloat(meal.peak_glucose)) {
        console.log(`  ❌ MISMATCH! Stored peak (${meal.peak_glucose}) != Actual peak (${actualPeak})`);
      } else if (meal.peak_glucose) {
        console.log(`  ✓ Stored peak matches actual peak`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkMealCorrelation();
