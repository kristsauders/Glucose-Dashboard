/**
 * Migration: add live_activity_tokens table
 *
 * Run from t1d-server/:
 *   node node_modules/.bin/tsx --tsconfig tsconfig.json scripts/migrate-live-activity-tokens.ts
 */

import { query } from '../src/config/database.js';

async function main() {
  console.log('Running migration: live_activity_tokens…');

  await query(`
    CREATE TABLE IF NOT EXISTS live_activity_tokens (
      user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token       TEXT        NOT NULL,
      activity_id TEXT        NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, activity_id)
    )
  `);

  console.log('✓ live_activity_tokens table ready.');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
