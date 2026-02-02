import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

async function addDiscordColumn() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔗 Connecting to database...');

    // Check if column already exists
    const checkResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name = 'discord_user_id'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✓ Column discord_user_id already exists');
      return;
    }

    console.log('📝 Adding discord_user_id column to users table...');

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN discord_user_id TEXT UNIQUE
    `);

    console.log('✅ Column added successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addDiscordColumn();
