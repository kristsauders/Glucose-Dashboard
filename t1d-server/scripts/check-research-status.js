#!/usr/bin/env node

/**
 * Check research monitor and notification status
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('=== Research Monitor & Notifications Status ===\n');

    // Check if research_preferences column exists
    console.log('1. Checking research_preferences column...');
    try {
      const result = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'users' AND column_name = 'research_preferences'`
      );

      if (result.rows.length === 0) {
        console.log('❌ research_preferences column NOT found');
        console.log('   Run: npm run migrate:research\n');
      } else {
        console.log('✓ research_preferences column exists\n');

        // Check user preferences
        console.log('2. Checking your research preferences...');
        const userPrefs = await pool.query(
          `SELECT id, email, research_preferences FROM users LIMIT 1`
        );

        if (userPrefs.rows.length > 0) {
          const user = userPrefs.rows[0];
          console.log(`   User: ${user.email}`);
          console.log(`   Preferences: ${JSON.stringify(user.research_preferences, null, 2)}\n`);

          if (user.research_preferences?.enabled) {
            console.log('✓ Research updates are ENABLED\n');
          } else {
            console.log('❌ Research updates are DISABLED');
            console.log('   Enable in settings or update database\n');
          }
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }

    // Check research monitoring state
    console.log('3. Checking research monitor status...');
    try {
      const stateResult = await pool.query(
        `SELECT * FROM research_monitoring_state ORDER BY updated_at DESC LIMIT 1`
      );

      if (stateResult.rows.length === 0) {
        console.log('❌ research_monitoring_state table is empty');
        console.log('   The research monitor has never run\n');
      } else {
        const state = stateResult.rows[0];
        console.log(`   Last scheduled check: ${state.last_scheduled_check || 'Never'}`);
        console.log(`   Last successful check: ${state.last_successful_check || 'Never'}`);
        console.log(`   Next scheduled check: ${state.next_scheduled_check || 'Unknown'}`);
        console.log(`   Papers discovered (last run): ${state.papers_discovered_last_run}`);
        console.log(`   Users notified (last run): ${state.users_notified_last_run}\n`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      console.log('   research_monitoring_state table may not exist\n');
    }

    // Check research papers
    console.log('4. Checking discovered research papers...');
    try {
      const papersResult = await pool.query(
        `SELECT COUNT(*) as count FROM research_papers`
      );
      console.log(`   Total papers in database: ${papersResult.rows[0].count}\n`);

      if (papersResult.rows[0].count > 0) {
        const recentPapers = await pool.query(
          `SELECT title, published_date, created_at
           FROM research_papers
           ORDER BY created_at DESC
           LIMIT 5`
        );
        console.log('   Recent papers:');
        recentPapers.rows.forEach((p, i) => {
          console.log(`   ${i + 1}. ${p.title.substring(0, 60)}...`);
          console.log(`      Published: ${p.published_date}, Added: ${new Date(p.created_at).toLocaleDateString()}`);
        });
        console.log('');
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      console.log('   research_papers table may not exist\n');
    }

    // Check action buttons in recent proactive messages
    console.log('5. Checking for action buttons in recent messages...');
    try {
      const messagesResult = await pool.query(
        `SELECT id, type, title, metadata, sent_at
         FROM sage_messages
         ORDER BY sent_at DESC
         LIMIT 5`
      );

      if (messagesResult.rows.length === 0) {
        console.log('   No proactive messages found\n');
      } else {
        let foundActions = false;
        messagesResult.rows.forEach((msg, i) => {
          const actions = msg.metadata?.actions || [];
          if (actions.length > 0) {
            console.log(`   ✓ Message ${i + 1}: "${msg.title}" has ${actions.length} action buttons`);
            foundActions = true;
          }
        });

        if (!foundActions) {
          console.log('   ❌ No action buttons found in recent messages');
          console.log('   Action buttons may not be implemented yet\n');
        } else {
          console.log('');
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }

    // Check push notification subscriptions
    console.log('6. Checking push notification subscriptions...');
    try {
      const subsResult = await pool.query(
        `SELECT COUNT(*) as count FROM push_subscriptions`
      );
      console.log(`   Active push subscriptions: ${subsResult.rows[0].count}\n`);

      if (subsResult.rows[0].count === 0) {
        console.log('   ❌ No push subscriptions');
        console.log('   You need to grant notification permission in /chat\n');
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      console.log('   push_subscriptions table may not exist\n');
    }

    console.log('=== Summary ===');
    console.log('For research papers to work:');
    console.log('  1. Run migration: npm run migrate:research');
    console.log('  2. Wait for next scheduled check (~2.5 days after server start)');
    console.log('  3. Or manually trigger: (not yet implemented)\n');

    console.log('For action buttons to work:');
    console.log('  1. They need to be added to proactive messages via the agent');
    console.log('  2. Check prompts.ts for action button guidance');
    console.log('  3. Ensure sendProactiveMessageTool has actions parameter\n');

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

main();
