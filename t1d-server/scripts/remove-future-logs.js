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

async function removeFutureLogs() {
  const client = await pool.connect();

  try {
    console.log('Removing future log entries...\n');

    await client.query('BEGIN');

    // 1. Find and delete future meals
    const futureMealsResult = await client.query(`
      SELECT id, timestamp, description, meal_type
      FROM meals
      WHERE timestamp > NOW()
      ORDER BY timestamp DESC
    `);

    console.log(`Found ${futureMealsResult.rows.length} future meals:`);
    futureMealsResult.rows.forEach(meal => {
      console.log(`  - ${meal.description} (${meal.meal_type}) at ${meal.timestamp}`);
    });

    if (futureMealsResult.rows.length > 0) {
      await client.query(`DELETE FROM meals WHERE timestamp > NOW()`);
      console.log(`✓ Deleted ${futureMealsResult.rows.length} future meals\n`);
    }

    // 2. Find and delete future exercise logs
    const futureExerciseResult = await client.query(`
      SELECT id, timestamp, description, activity_type
      FROM exercise_logs
      WHERE timestamp > NOW()
      ORDER BY timestamp DESC
    `);

    console.log(`Found ${futureExerciseResult.rows.length} future exercise logs:`);
    futureExerciseResult.rows.forEach(ex => {
      console.log(`  - ${ex.description || ex.activity_type} at ${ex.timestamp}`);
    });

    if (futureExerciseResult.rows.length > 0) {
      await client.query(`DELETE FROM exercise_logs WHERE timestamp > NOW()`);
      console.log(`✓ Deleted ${futureExerciseResult.rows.length} future exercise logs\n`);
    }

    // 3. Find and delete future insulin doses
    const futureInsulinResult = await client.query(`
      SELECT id, timestamp, insulin_type, units, type
      FROM insulin_doses
      WHERE timestamp > NOW()
      ORDER BY timestamp DESC
    `);

    console.log(`Found ${futureInsulinResult.rows.length} future insulin doses:`);
    futureInsulinResult.rows.forEach(ins => {
      console.log(`  - ${ins.units}u ${ins.insulin_type} (${ins.type}) at ${ins.timestamp}`);
    });

    if (futureInsulinResult.rows.length > 0) {
      await client.query(`DELETE FROM insulin_doses WHERE timestamp > NOW()`);
      console.log(`✓ Deleted ${futureInsulinResult.rows.length} future insulin doses\n`);
    }

    await client.query('COMMIT');

    const total = futureMealsResult.rows.length + futureExerciseResult.rows.length + futureInsulinResult.rows.length;

    if (total === 0) {
      console.log('✓ No future log entries found - database is clean!');
    } else {
      console.log(`✓ Successfully removed ${total} future log entries total`);
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error removing future logs:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

removeFutureLogs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
