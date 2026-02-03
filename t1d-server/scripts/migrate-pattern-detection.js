#!/usr/bin/env node
/**
 * Migration: Pattern Detection & Correlation Analysis
 *
 * Creates tables and enhances existing tables for:
 * - Glucose correlation tracking (meal/exercise/insulin → glucose response)
 * - Pattern event logging
 * - Enhanced pattern metadata
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔄 Starting migration: Pattern Detection & Correlation Analysis\n');

    // ============================================================================
    // 1. ENHANCE GLUCOSE_PATTERNS TABLE
    // ============================================================================
    console.log('📝 Enhancing glucose_patterns table...');

    await pool.query(`
      -- Add new columns to glucose_patterns if they don't exist
      ALTER TABLE glucose_patterns
      ADD COLUMN IF NOT EXISTS trigger_event_type TEXT,
      ADD COLUMN IF NOT EXISTS trigger_event_details JSONB,
      ADD COLUMN IF NOT EXISTS example_event_ids UUID[];

      -- Update index for better performance
      DROP INDEX IF EXISTS idx_patterns_user;
      DROP INDEX IF EXISTS idx_patterns_type;
      CREATE INDEX IF NOT EXISTS idx_patterns_user_type ON glucose_patterns(user_id, pattern_type);
    `);

    console.log('  ✓ Glucose_patterns table enhanced');

    // ============================================================================
    // 2. CREATE GLUCOSE_CORRELATIONS TABLE
    // ============================================================================
    console.log('📝 Creating glucose_correlations table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS glucose_correlations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,

        -- Trigger event
        trigger_event_type TEXT NOT NULL,  -- 'meal', 'exercise', 'insulin'
        trigger_event_id UUID NOT NULL,
        trigger_timestamp TIMESTAMPTZ NOT NULL,

        -- Glucose response
        baseline_glucose DECIMAL,
        peak_glucose DECIMAL,  -- For meals/insulin; for exercise, this might be lowest
        lowest_glucose DECIMAL,  -- For exercise
        time_to_peak_minutes INTEGER,
        time_to_lowest_minutes INTEGER,
        total_change DECIMAL,
        area_over_baseline DECIMAL,
        time_in_range_pct DECIMAL,

        -- Response window
        window_start TIMESTAMPTZ NOT NULL,
        window_end TIMESTAMPTZ NOT NULL,
        glucose_readings_count INTEGER,

        -- Pattern matching
        matched_pattern_id UUID REFERENCES glucose_patterns(id) ON DELETE SET NULL,

        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_correlations_user_trigger
        ON glucose_correlations(user_id, trigger_event_type, trigger_timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_correlations_event
        ON glucose_correlations(trigger_event_id);
      CREATE INDEX IF NOT EXISTS idx_correlations_pattern
        ON glucose_correlations(matched_pattern_id) WHERE matched_pattern_id IS NOT NULL;
    `);

    console.log('  ✓ Glucose_correlations table created');

    // ============================================================================
    // 3. CREATE PATTERN_EVENTS TABLE
    // ============================================================================
    console.log('📝 Creating pattern_events table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pattern_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        pattern_id UUID REFERENCES glucose_patterns(id) ON DELETE CASCADE,
        correlation_id UUID REFERENCES glucose_correlations(id) ON DELETE CASCADE,

        -- When it occurred
        event_timestamp TIMESTAMPTZ NOT NULL,
        detected_at TIMESTAMPTZ DEFAULT NOW(),

        -- Match quality
        confidence DECIMAL CHECK (confidence >= 0 AND confidence <= 1),
        deviation_from_typical DECIMAL,

        -- Notification tracking
        notified_user BOOLEAN DEFAULT FALSE,
        notification_sent_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_pattern_events_user_time
        ON pattern_events(user_id, event_timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_pattern_events_pattern
        ON pattern_events(pattern_id);
      CREATE INDEX IF NOT EXISTS idx_pattern_events_unnotified
        ON pattern_events(user_id, notified_user) WHERE notified_user = FALSE;
    `);

    console.log('  ✓ Pattern_events table created');

    // ============================================================================
    // 4. ADD CORRELATION_ID TO EXISTING TABLES
    // ============================================================================
    console.log('📝 Adding correlation tracking to existing tables...');

    await pool.query(`
      -- Add correlation_id to meals
      ALTER TABLE meals
      ADD COLUMN IF NOT EXISTS correlation_id UUID REFERENCES glucose_correlations(id);

      -- Add correlation_id to exercise_logs
      ALTER TABLE exercise_logs
      ADD COLUMN IF NOT EXISTS correlation_id UUID REFERENCES glucose_correlations(id);

      -- Add correlation_id to insulin_doses
      ALTER TABLE insulin_doses
      ADD COLUMN IF NOT EXISTS correlation_id UUID REFERENCES glucose_correlations(id);

      -- Create indexes for efficient lookups
      CREATE INDEX IF NOT EXISTS idx_meals_correlation
        ON meals(correlation_id) WHERE correlation_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_exercise_correlation
        ON exercise_logs(correlation_id) WHERE correlation_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_insulin_correlation
        ON insulin_doses(correlation_id) WHERE correlation_id IS NOT NULL;
    `);

    console.log('  ✓ Correlation tracking added to existing tables');

    // ============================================================================
    // 5. CREATE HELPFUL VIEWS FOR PATTERN ANALYSIS
    // ============================================================================
    console.log('📝 Creating pattern analysis views...');

    await pool.query(`
      -- View: Meals with their glucose correlations
      CREATE OR REPLACE VIEW meals_with_correlations AS
      SELECT
        m.*,
        c.baseline_glucose,
        c.peak_glucose,
        c.time_to_peak_minutes,
        c.total_change as glucose_rise,
        c.time_in_range_pct,
        c.matched_pattern_id
      FROM meals m
      LEFT JOIN glucose_correlations c ON m.correlation_id = c.id
      ORDER BY m.timestamp DESC;

      -- View: Exercise with their glucose correlations
      CREATE OR REPLACE VIEW exercise_with_correlations AS
      SELECT
        e.*,
        c.baseline_glucose,
        c.lowest_glucose,
        c.time_to_lowest_minutes,
        c.total_change as glucose_drop,
        c.time_in_range_pct,
        c.matched_pattern_id
      FROM exercise_logs e
      LEFT JOIN glucose_correlations c ON e.correlation_id = c.id
      ORDER BY e.timestamp DESC;

      -- View: Insulin with their glucose correlations
      CREATE OR REPLACE VIEW insulin_with_correlations AS
      SELECT
        i.*,
        c.baseline_glucose,
        c.lowest_glucose,
        c.time_to_lowest_minutes,
        c.total_change as glucose_drop,
        c.time_in_range_pct,
        c.matched_pattern_id
      FROM insulin_doses i
      LEFT JOIN glucose_correlations c ON i.correlation_id = c.id
      ORDER BY i.timestamp DESC;
    `);

    console.log('  ✓ Pattern analysis views created');

    console.log('\n✅ Migration completed successfully!\n');
    console.log('Summary:');
    console.log('  • Enhanced glucose_patterns table with trigger event tracking');
    console.log('  • Created glucose_correlations table (meal/exercise/insulin → glucose)');
    console.log('  • Created pattern_events table for pattern occurrence tracking');
    console.log('  • Added correlation_id to meals, exercise_logs, insulin_doses');
    console.log('  • Created helpful views for correlation analysis\n');
    console.log('📊 Ready for pattern detection algorithms!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('\nStack trace:', error.stack);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration
migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
