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

async function debugDinnerPeak() {
  try {
    console.log('🔍 Checking last night\'s spaghetti dinner...\n');

    // Find the meal
    const mealResult = await pool.query(`
      SELECT
        m.id,
        m.timestamp,
        m.description,
        m.carbs,
        m.user_id,
        m.correlation_id,
        c.baseline_glucose,
        c.peak_glucose,
        c.time_to_peak_minutes,
        c.total_change,
        c.time_in_range_pct
      FROM meals m
      LEFT JOIN glucose_correlations c ON m.correlation_id = c.id
      WHERE m.description = 'spaghetti and meatballs'
        AND m.timestamp >= NOW() - INTERVAL '2 days'
      ORDER BY m.timestamp DESC
      LIMIT 1
    `);

    if (mealResult.rows.length === 0) {
      console.log('❌ No spaghetti dinner found in last 2 days');
      return;
    }

    const meal = mealResult.rows[0];
    console.log('📍 Meal Found:');
    console.log(`   ID: ${meal.id}`);
    console.log(`   Time: ${meal.timestamp}`);
    console.log(`   Description: ${meal.description}`);
    console.log(`   Carbs: ${meal.carbs}g`);
    console.log(`   Has correlation: ${!!meal.correlation_id}\n`);

    if (!meal.correlation_id) {
      console.log('⚠️  No correlation data found - background service hasn\'t analyzed this meal yet');
      return;
    }

    console.log('📊 Stored Correlation Data:');
    console.log(`   Baseline: ${meal.baseline_glucose} mg/dL`);
    console.log(`   Peak: ${meal.peak_glucose} mg/dL`);
    console.log(`   Time to peak: ${meal.time_to_peak_minutes} min`);
    console.log(`   Total change: ${meal.total_change} mg/dL`);
    console.log(`   Time in range: ${meal.time_in_range_pct}%\n`);

    // Check actual glucose readings in 3-hour window
    const mealTime = new Date(meal.timestamp);
    const threeHoursLater = new Date(mealTime.getTime() + (3 * 60 * 60 * 1000));

    console.log('🩸 Querying Actual Glucose Readings:');
    console.log(`   Window: ${mealTime.toISOString()} to ${threeHoursLater.toISOString()}`);
    console.log(`   (3-hour post-meal window)\n`);

    const glucoseResult = await pool.query(`
      SELECT timestamp, glucose
      FROM glucose_readings
      WHERE user_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
      ORDER BY timestamp ASC
    `, [meal.user_id, meal.timestamp, threeHoursLater.toISOString()]);

    if (glucoseResult.rows.length === 0) {
      console.log('❌ NO GLUCOSE DATA FOUND in the 3-hour post-meal window!');
      console.log('   This explains why the peak is wrong - there\'s no data to analyze.');
      console.log('\n💡 Possible causes:');
      console.log('   1. CGM wasn\'t transmitting during this time');
      console.log('   2. Timezone issue - data might be stored with wrong timestamps');
      console.log('   3. Data import issue');
      return;
    }

    console.log(`✅ Found ${glucoseResult.rows.length} glucose readings:\n`);

    // Show all readings
    glucoseResult.rows.forEach(r => {
      const localTime = new Date(r.timestamp).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      console.log(`   ${localTime}: ${r.glucose} mg/dL`);
    });

    // Calculate actual peak
    const actualPeak = Math.max(...glucoseResult.rows.map(r => parseInt(r.glucose)));
    const actualBaseline = parseInt(glucoseResult.rows[0].glucose);

    console.log(`\n📈 Analysis:`);
    console.log(`   Actual baseline (first reading): ${actualBaseline} mg/dL`);
    console.log(`   Actual peak (max in window): ${actualPeak} mg/dL`);
    console.log(`   Actual rise: ${actualPeak - actualBaseline} mg/dL\n`);

    // Compare with stored data
    const storedPeak = parseFloat(meal.peak_glucose);
    const storedBaseline = parseFloat(meal.baseline_glucose);

    if (actualPeak === storedPeak) {
      console.log('✅ STORED DATA MATCHES ACTUAL DATA');
    } else {
      console.log('❌ MISMATCH DETECTED!');
      console.log(`   Stored peak: ${storedPeak} mg/dL`);
      console.log(`   Actual peak: ${actualPeak} mg/dL`);
      console.log(`   Difference: ${actualPeak - storedPeak} mg/dL off\n`);

      console.log('💡 The background correlation service computed the wrong peak.');
      console.log('   This needs to be debugged in pattern-algorithms.ts');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugDinnerPeak();
