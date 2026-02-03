#!/usr/bin/env node
/**
 * Migration: Multi-Timescale Reporting System
 *
 * Creates tables for:
 * - Daily reports (generated at 8am daily)
 * - Weekly reports (generated Monday 8am)
 * - Monthly reports (generated 1st of month, 9am)
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
    console.log('🔄 Starting migration: Multi-Timescale Reporting System\n');

    // ============================================================================
    // 1. CREATE DAILY_REPORTS TABLE
    // ============================================================================
    console.log('📝 Creating daily_reports table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        report_date DATE NOT NULL,

        -- Core metrics
        avg_glucose DECIMAL,
        min_glucose DECIMAL,
        max_glucose DECIMAL,
        std_dev DECIMAL,
        cv DECIMAL,
        estimated_a1c DECIMAL,

        -- Time in range
        tir_70_180_pct DECIMAL,
        tir_70_140_pct DECIMAL,
        time_below_70_pct DECIMAL,
        time_above_180_pct DECIMAL,

        -- Events
        hypoglycemia_episodes INTEGER DEFAULT 0,
        hyperglycemia_episodes INTEGER DEFAULT 0,
        meals_logged INTEGER DEFAULT 0,
        exercise_sessions INTEGER DEFAULT 0,

        -- Overnight analysis
        overnight_avg_glucose DECIMAL,
        overnight_stability VARCHAR(20), -- 'stable', 'rising', 'falling'

        -- Summary
        summary TEXT,
        highlights JSONB, -- Array of key points
        patterns_detected JSONB,

        generated_at TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE(user_id, report_date)
      );

      CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date
        ON daily_reports(user_id, report_date DESC);
    `);

    console.log('  ✓ Daily_reports table created');

    // ============================================================================
    // 2. CREATE WEEKLY_REPORTS TABLE
    // ============================================================================
    console.log('📝 Creating weekly_reports table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS weekly_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        week_start_date DATE NOT NULL,
        week_end_date DATE NOT NULL,

        -- Weekly metrics
        avg_glucose_week DECIMAL,
        avg_tir_70_180_pct DECIMAL,
        avg_cv DECIMAL,
        estimated_a1c DECIMAL,

        -- Trends
        trend_direction VARCHAR(20), -- 'improving', 'worsening', 'stable'
        trend_slope DECIMAL,
        trend_r_squared DECIMAL,

        -- Comparisons
        vs_previous_week JSONB, -- {avgGlucoseChange: -5, tirChange: +3}

        -- Best/worst days
        best_day_date DATE,
        best_day_avg DECIMAL,
        worst_day_date DATE,
        worst_day_avg DECIMAL,

        -- Patterns
        patterns_summary JSONB,

        -- Summary
        summary TEXT,
        highlights JSONB,
        recommendations JSONB,

        generated_at TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE(user_id, week_start_date)
      );

      CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_date
        ON weekly_reports(user_id, week_start_date DESC);
    `);

    console.log('  ✓ Weekly_reports table created');

    // ============================================================================
    // 3. CREATE MONTHLY_REPORTS TABLE
    // ============================================================================
    console.log('📝 Creating monthly_reports table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS monthly_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        month_start_date DATE NOT NULL,
        month_end_date DATE NOT NULL,

        -- Monthly metrics
        avg_glucose_month DECIMAL,
        avg_tir_70_180_pct DECIMAL,
        avg_cv DECIMAL,
        estimated_a1c DECIMAL,
        a1c_confidence_interval_lower DECIMAL,
        a1c_confidence_interval_upper DECIMAL,

        -- Episodes
        total_hypoglycemia_episodes INTEGER DEFAULT 0,
        total_hyperglycemia_episodes INTEGER DEFAULT 0,

        -- Activity
        total_meals_logged INTEGER DEFAULT 0,
        total_exercise_sessions INTEGER DEFAULT 0,
        total_insulin_doses INTEGER DEFAULT 0,

        -- Weekly breakdown
        weekly_data JSONB, -- Array of 4-5 weeks with metrics

        -- Patterns
        patterns_summary JSONB,
        pattern_changes JSONB, -- {strengthened: [...], weakened: [...], new: [...]}

        -- Comparisons
        vs_previous_month JSONB,
        vs_3_months_ago JSONB,

        -- Long-term trends (if enough data)
        long_term_trend JSONB,

        -- Summary
        summary TEXT,
        highlights JSONB,
        recommendations JSONB,
        provider_summary TEXT, -- For healthcare visits

        generated_at TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE(user_id, month_start_date)
      );

      CREATE INDEX IF NOT EXISTS idx_monthly_reports_user_date
        ON monthly_reports(user_id, month_start_date DESC);
    `);

    console.log('  ✓ Monthly_reports table created');

    // ============================================================================
    // 4. UPDATE GLUCOSE_MONITORING_STATE TABLE
    // ============================================================================
    console.log('📝 Updating glucose_monitoring_state table...');

    await pool.query(`
      -- Add report tracking columns if they don't exist
      ALTER TABLE glucose_monitoring_state
      ADD COLUMN IF NOT EXISTS last_daily_report_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_weekly_report_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_monthly_report_at TIMESTAMPTZ;
    `);

    console.log('  ✓ Glucose_monitoring_state table updated');

    console.log('\n✅ Migration completed successfully!\n');
    console.log('Summary:');
    console.log('  • Created daily_reports table (8am daily summaries)');
    console.log('  • Created weekly_reports table (Monday 8am insights)');
    console.log('  • Created monthly_reports table (1st of month, 9am)');
    console.log('  • Updated glucose_monitoring_state with report tracking\n');
    console.log('📊 Ready for reporting service implementation!\n');

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
