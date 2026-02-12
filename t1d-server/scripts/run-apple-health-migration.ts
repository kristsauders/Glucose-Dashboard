import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    console.log('Running Apple Health migration...');
    console.log('Adding workout_id column and indexes to exercise_logs table...');

    const migrationSQL = readFileSync(
      join(__dirname, 'add-apple-health-columns.sql'),
      'utf-8'
    );

    await pool.query(migrationSQL);

    console.log('✓ Migration completed successfully!');
    console.log('✓ Added workout_id column to exercise_logs');
    console.log('✓ Created unique index for deduplication');
    console.log('✓ Created lookup index for performance');

    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
