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
    console.log('Running query audit log migration...');
    console.log(`Database: ${process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@')}`);
    console.log('');

    // Read the SQL file
    const sqlFile = join(__dirname, 'add-query-audit-log.sql');
    const sql = readFileSync(sqlFile, 'utf8');

    // Execute the migration
    await pool.query(sql);

    console.log('✓ Migration completed successfully!');
    console.log('✓ Created table: query_audit_log');
    console.log('✓ Created indexes: idx_query_audit_user_id, idx_query_audit_executed_at');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
