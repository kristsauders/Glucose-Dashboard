#!/usr/bin/env node
/**
 * Adds the two tables introduced for Python analysis support:
 *   - sleep_logs
 *   - analysis_cache
 *
 * Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS).
 * Usage: node scripts/migrate-new-tables.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const SLEEP_LOGS = `
CREATE TABLE IF NOT EXISTS sleep_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  quality TEXT,
  notes TEXT,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sleep_user_time ON sleep_logs(user_id, timestamp DESC);
`;

const ANALYSIS_CACHE = `
CREATE TABLE IF NOT EXISTS analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  data_window_start TIMESTAMPTZ,
  data_window_end TIMESTAMPTZ,
  results JSONB NOT NULL,
  metadata JSONB DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_cache_user_type_unique
  ON analysis_cache(user_id, analysis_type);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_computed
  ON analysis_cache(user_id, computed_at DESC);
`;

async function run() {
  console.log('Running new table migrations...\n');
  try {
    await pool.query(SLEEP_LOGS);
    console.log('✅ sleep_logs');
    await pool.query(ANALYSIS_CACHE);
    console.log('✅ analysis_cache');
    console.log('\nDone.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
