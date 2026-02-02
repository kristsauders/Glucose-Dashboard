#!/usr/bin/env node
/**
 * Migration script to add conversations support
 *
 * This script:
 * 1. Adds conversations table and conversation_id column to chat_messages
 * 2. Creates a "Legacy Chat" conversation for each user with existing messages
 * 3. Links existing messages to their user's Legacy Chat conversation
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting conversations migration...\n');

    // Start transaction
    await client.query('BEGIN');

    // Step 1: Create conversations table (if not exists)
    console.log('📝 Creating conversations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
      ON conversations(user_id, updated_at DESC);

      -- Add trigger for conversations table
      DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
      CREATE TRIGGER update_conversations_updated_at
        BEFORE UPDATE ON conversations
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
    `);
    console.log('✓ Conversations table created\n');

    // Step 2: Add conversation_id column to chat_messages (if not exists)
    console.log('📝 Adding conversation_id column to chat_messages...');
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'chat_messages' AND column_name = 'conversation_id'
        ) THEN
          ALTER TABLE chat_messages
          ADD COLUMN conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

          CREATE INDEX IF NOT EXISTS idx_chat_conversation
          ON chat_messages(conversation_id, created_at ASC);
        END IF;
      END $$;
    `);
    console.log('✓ conversation_id column added\n');

    // Step 3: Find users with existing chat messages
    console.log('🔍 Finding users with existing messages...');
    const usersResult = await client.query(`
      SELECT DISTINCT user_id
      FROM chat_messages
      WHERE conversation_id IS NULL
    `);

    const userIds = usersResult.rows.map(r => r.user_id);
    console.log(`✓ Found ${userIds.length} users with messages\n`);

    if (userIds.length === 0) {
      console.log('✅ No migration needed - no existing messages found');
      await client.query('COMMIT');
      return;
    }

    // Step 4: Create Legacy Chat conversation for each user
    console.log('📦 Creating Legacy Chat conversations...');
    for (const userId of userIds) {
      // Get count of messages for this user
      const countResult = await client.query(
        'SELECT COUNT(*) as count FROM chat_messages WHERE user_id = $1 AND conversation_id IS NULL',
        [userId]
      );
      const messageCount = parseInt(countResult.rows[0].count);

      // Create Legacy Chat conversation
      const conversationResult = await client.query(
        `INSERT INTO conversations (user_id, title, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id`,
        [userId, 'Legacy Chat']
      );
      const conversationId = conversationResult.rows[0].id;

      // Link all user's messages to this conversation
      await client.query(
        `UPDATE chat_messages
         SET conversation_id = $1
         WHERE user_id = $2 AND conversation_id IS NULL`,
        [conversationId, userId]
      );

      console.log(`  ✓ User ${userId.substring(0, 8)}... : Created Legacy Chat with ${messageCount} messages`);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log(`   - Created ${userIds.length} Legacy Chat conversations`);
    console.log('   - All existing messages linked to conversations\n');

    // Commit transaction
    await client.query('COMMIT');

  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
