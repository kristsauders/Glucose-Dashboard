import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create readline interface for user confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function fixMealTimestamps() {
  const client = await pool.connect();

  try {
    console.log('🔍 Finding meals to fix...\n');

    // Get yesterday at 9am in America/New_York timezone
    const cutoffTime = await client.query(`
      SELECT
        (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/New_York') - INTERVAL '1 day' + INTERVAL '9 hours') AT TIME ZONE 'America/New_York' as cutoff
    `);

    const cutoff = cutoffTime.rows[0].cutoff;
    console.log(`Cutoff time: ${cutoff} (yesterday 9am EST)\n`);

    // Find meals that need fixing
    const mealsToFix = await client.query(`
      SELECT
        id,
        timestamp,
        timestamp AT TIME ZONE 'America/New_York' as current_local,
        (timestamp - INTERVAL '5 hours') AT TIME ZONE 'America/New_York' as corrected_local,
        description,
        meal_type,
        created_at
      FROM meals
      WHERE source = 'agent'
        AND created_at >= $1
      ORDER BY timestamp ASC
    `, [cutoff]);

    if (mealsToFix.rows.length === 0) {
      console.log('✓ No meals need fixing!');
      return;
    }

    console.log(`Found ${mealsToFix.rows.length} meals to fix:\n`);
    console.log('Current Time (WRONG) → Corrected Time (RIGHT)');
    console.log('='.repeat(70));

    mealsToFix.rows.forEach((meal, i) => {
      const current = new Date(meal.current_local).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const corrected = new Date(meal.corrected_local).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      console.log(`${i + 1}. ${meal.description} (${meal.meal_type || 'no type'})`);
      console.log(`   ${current} → ${corrected}`);
    });

    console.log('\n' + '='.repeat(70));
    const answer = await question('\nApply these fixes? (yes/no): ');

    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Cancelled - no changes made');
      return;
    }

    // Apply the fix in a transaction
    await client.query('BEGIN');

    console.log('\n🔧 Applying fixes...');

    const result = await client.query(`
      UPDATE meals
      SET timestamp = timestamp - INTERVAL '5 hours'
      WHERE source = 'agent'
        AND created_at >= $1
      RETURNING id
    `, [cutoff]);

    await client.query('COMMIT');

    console.log(`✓ Fixed ${result.rowCount} meals!`);
    console.log('\n📊 Verifying fixes...\n');

    // Show the corrected meals
    const verified = await client.query(`
      SELECT
        timestamp AT TIME ZONE 'America/New_York' as local_time,
        description,
        meal_type
      FROM meals
      WHERE source = 'agent'
        AND created_at >= $1
      ORDER BY timestamp ASC
    `, [cutoff]);

    console.log('Corrected meal times:');
    verified.rows.forEach(meal => {
      const time = new Date(meal.local_time).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      console.log(`  ${time} - ${meal.description} (${meal.meal_type || 'no type'})`);
    });

    console.log('\n✅ All done!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
    rl.close();
  }
}

fixMealTimestamps();
