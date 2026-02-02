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

async function setupDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔗 Connecting to database...');

    // Read schema file
    const schemaPath = join(__dirname, '../src/db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    console.log('📝 Running database schema...');
    await pool.query(schema);

    console.log('✅ Database setup complete!');

    // Test the connection
    const result = await pool.query('SELECT NOW()');
    console.log('🕐 Database time:', result.rows[0].now);

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();
