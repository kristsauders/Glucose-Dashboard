import { query } from '../src/config/database.js';

/**
 * Migration: Update timezone default from America/Los_Angeles to America/New_York
 *
 * This script:
 * 1. Changes the column default for future users
 * 2. Optionally updates existing users with Los_Angeles timezone to New_York
 */

async function migrateTimezoneDefault() {
  try {
    console.log('🔄 Starting timezone default migration...\n');

    // 1. Update column default
    console.log('1. Updating column default...');
    await query(`
      ALTER TABLE users
      ALTER COLUMN timezone SET DEFAULT 'America/New_York'
    `);
    console.log('✓ Column default updated to America/New_York\n');

    // 2. Check for users with Los_Angeles timezone
    const result = await query(`
      SELECT COUNT(*) as count
      FROM users
      WHERE timezone = 'America/Los_Angeles'
    `);

    const count = parseInt(result.rows[0].count);

    if (count > 0) {
      console.log(`⚠️  Found ${count} user(s) with 'America/Los_Angeles' timezone`);
      console.log('   These users will keep their Pacific timezone unless manually updated.');
      console.log('   To update them, run: UPDATE users SET timezone = \'America/New_York\' WHERE timezone = \'America/Los_Angeles\';');
    } else {
      console.log('✓ No users found with Los_Angeles timezone');
    }

    console.log('\n✅ Migration complete!');
    console.log('New users will now default to America/New_York timezone.\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }

  process.exit(0);
}

migrateTimezoneDefault();
