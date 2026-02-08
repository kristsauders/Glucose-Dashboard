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

async function resetMealCorrelations() {
  const client = await pool.connect();

  try {
    console.log('Resetting meal correlations to fix glucose peak calculations...\n');

    await client.query('BEGIN');

    // 1. Get count of correlations that will be deleted
    const countResult = await client.query(`
      SELECT COUNT(*) as count
      FROM glucose_correlations
      WHERE trigger_event_type = 'meal'
    `);
    const correlationCount = parseInt(countResult.rows[0].count);

    console.log(`Found ${correlationCount} meal correlations to reset`);

    // 2. Clear correlation_id from meals table
    console.log('Clearing correlation_id from meals...');
    await client.query(`
      UPDATE meals
      SET correlation_id = NULL,
          observed_spike = NULL,
          time_to_peak = NULL
      WHERE correlation_id IS NOT NULL
    `);

    // 3. Delete meal correlations
    console.log('Deleting glucose correlations...');
    await client.query(`
      DELETE FROM glucose_correlations
      WHERE trigger_event_type = 'meal'
    `);

    await client.query('COMMIT');

    console.log('\n✓ Successfully reset meal correlations!');
    console.log('✓ Meals will be re-analyzed with the correct 3-hour post-meal window');
    console.log('✓ The background pattern detector will recompute correlations within 30 minutes');
    console.log(`✓ ${correlationCount} meals will be re-analyzed`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error resetting correlations:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

resetMealCorrelations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
