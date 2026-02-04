import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

async function runMigration() {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL not found in .env file');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Running push notification migration...');
    console.log(`Database: ${process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@')}`);
    console.log('');

    // Read the SQL file
    const sqlFile = join(__dirname, 'migrate-push-notifications.sql');
    const sql = readFileSync(sqlFile, 'utf8');

    // Execute the migration
    await pool.query(sql);

    console.log('✓ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
