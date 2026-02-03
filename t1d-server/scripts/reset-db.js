import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

async function resetDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔗 Connecting to database...');
    console.log('⚠️  WARNING: This will DROP ALL TABLES and DATA!');
    console.log('');

    // Drop all tables in the public schema
    console.log('🗑️  Dropping all existing tables...');
    await pool.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        -- Drop all tables
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;

        -- Drop all sequences
        FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
          EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.sequence_name) || ' CASCADE';
        END LOOP;

        -- Drop all functions
        FOR r IN (SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public') LOOP
          EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.routine_name) || ' CASCADE';
        END LOOP;
      END $$;
    `);
    console.log('✅ All tables dropped');

    // Read and execute schema - same as initial setup
    console.log('📝 Creating fresh database schema...');
    const schemaPath = join(__dirname, '../src/db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    await pool.query(schema);
    console.log('✅ Database schema created');

    // Test the connection
    const result = await pool.query('SELECT NOW()');
    console.log('🕐 Database time:', result.rows[0].now);

    console.log('');
    console.log('✨ Database reset complete! Fresh start ready.');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Start the server: npm run dev');
    console.log('  2. Register a new user account');
    console.log('  3. Connect to LibreView to start syncing glucose data');
    console.log('');
    console.log('Note: If you get "relation does not exist" errors, you may need to');
    console.log('      manually run migration scripts for additional tables.');

  } catch (error) {
    console.error('❌ Database reset failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetDatabase();
