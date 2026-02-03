#!/usr/bin/env node
/**
 * Migration: Advanced Tracking & Multi-Agent System
 *
 * Enhances existing tables and adds new tables for:
 * - Detailed meal/exercise/insulin tracking
 * - Pattern library
 * - Insight caching
 * - Agent analysis state
 * - Food database
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
    console.log('🔄 Starting migration: Advanced Tracking & Multi-Agent System\n');

    // ============================================================================
    // 1. ENHANCE MEALS TABLE
    // ============================================================================
    console.log('📝 Enhancing meals table...');

    await pool.query(`
      -- Add new columns to meals table
      ALTER TABLE meals
      ADD COLUMN IF NOT EXISTS estimated_carbs DECIMAL,
      ADD COLUMN IF NOT EXISTS estimated_protein DECIMAL,
      ADD COLUMN IF NOT EXISTS estimated_fat DECIMAL,
      ADD COLUMN IF NOT EXISTS estimated_calories DECIMAL,
      ADD COLUMN IF NOT EXISTS carb_confidence DECIMAL,
      ADD COLUMN IF NOT EXISTS estimation_method TEXT,
      ADD COLUMN IF NOT EXISTS meal_type TEXT,
      ADD COLUMN IF NOT EXISTS tags TEXT[],
      ADD COLUMN IF NOT EXISTS observed_spike DECIMAL,
      ADD COLUMN IF NOT EXISTS time_to_peak INTERVAL,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

      -- Migrate existing data: copy carbs to estimated_carbs
      UPDATE meals
      SET estimated_carbs = carbs,
          estimation_method = 'user_provided',
          carb_confidence = 1.0
      WHERE estimated_carbs IS NULL AND carbs IS NOT NULL;

      -- Create trigger for updated_at
      DROP TRIGGER IF EXISTS update_meals_updated_at ON meals;
      CREATE TRIGGER update_meals_updated_at
        BEFORE UPDATE ON meals
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
    `);

    console.log('  ✓ Meals table enhanced');

    // ============================================================================
    // 2. ENHANCE EXERCISE_LOGS TABLE & RENAME TO EXERCISE_SESSIONS
    // ============================================================================
    console.log('📝 Enhancing exercise_logs table...');

    await pool.query(`
      -- Add new columns to exercise_logs
      ALTER TABLE exercise_logs
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS activity_type TEXT,
      ADD COLUMN IF NOT EXISTS observed_drop DECIMAL,
      ADD COLUMN IF NOT EXISTS time_to_lowest INTERVAL,
      ADD COLUMN IF NOT EXISTS rebound_height DECIMAL,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

      -- Migrate existing data
      UPDATE exercise_logs
      SET activity_type = COALESCE(type, 'cardio'),
          description = COALESCE(notes, 'Exercise session')
      WHERE description IS NULL;

      -- Create trigger for updated_at
      DROP TRIGGER IF EXISTS update_exercise_logs_updated_at ON exercise_logs;
      CREATE TRIGGER update_exercise_logs_updated_at
        BEFORE UPDATE ON exercise_logs
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
    `);

    console.log('  ✓ Exercise_logs table enhanced');

    // ============================================================================
    // 3. ENHANCE INSULIN_DOSES TABLE
    // ============================================================================
    console.log('📝 Enhancing insulin_doses table...');

    await pool.query(`
      -- Add new columns to insulin_doses
      ALTER TABLE insulin_doses
      ADD COLUMN IF NOT EXISTS brand_name TEXT,
      ADD COLUMN IF NOT EXISTS purpose TEXT,
      ADD COLUMN IF NOT EXISTS related_meal_id UUID REFERENCES meals(id),
      ADD COLUMN IF NOT EXISTS observed_drop DECIMAL,
      ADD COLUMN IF NOT EXISTS duration_of_effect INTERVAL,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

      -- Migrate existing data
      UPDATE insulin_doses
      SET purpose = COALESCE(type, 'meal'),
          brand_name = insulin_type
      WHERE purpose IS NULL;

      -- Create trigger for updated_at
      DROP TRIGGER IF EXISTS update_insulin_doses_updated_at ON insulin_doses;
      CREATE TRIGGER update_insulin_doses_updated_at
        BEFORE UPDATE ON insulin_doses
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
    `);

    console.log('  ✓ Insulin_doses table enhanced');

    // ============================================================================
    // 4. CREATE GLUCOSE_PATTERNS TABLE
    // ============================================================================
    console.log('📝 Creating glucose_patterns table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS glucose_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,

        -- Pattern identification
        pattern_name TEXT NOT NULL,
        pattern_type TEXT,  -- 'meal_response', 'time_of_day', 'exercise_response', 'basal_trend'

        -- Pattern characteristics
        description TEXT,
        typical_duration INTERVAL,
        typical_magnitude DECIMAL,  -- Average glucose change

        -- When it occurs
        time_of_day_start TIME,
        time_of_day_end TIME,
        days_of_week INTEGER[],  -- [0=Sun, 1=Mon, ...]

        -- Associated factors
        triggers JSONB,  -- {"meal_type": "high-carb", "activity": "low"}

        -- Pattern data
        signature JSONB,  -- Statistical signature for pattern matching
        example_timestamps TIMESTAMPTZ[],  -- When this pattern occurred

        -- Metadata
        first_detected TIMESTAMPTZ DEFAULT NOW(),
        last_seen TIMESTAMPTZ DEFAULT NOW(),
        occurrence_count INTEGER DEFAULT 1,
        confidence DECIMAL,  -- How confident we are this is a real pattern

        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_patterns_user ON glucose_patterns(user_id);
      CREATE INDEX IF NOT EXISTS idx_patterns_type ON glucose_patterns(pattern_type);
      CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON glucose_patterns(user_id, confidence DESC);

      -- Create trigger for updated_at
      DROP TRIGGER IF EXISTS update_glucose_patterns_updated_at ON glucose_patterns;
      CREATE TRIGGER update_glucose_patterns_updated_at
        BEFORE UPDATE ON glucose_patterns
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
    `);

    console.log('  ✓ Glucose_patterns table created');

    // ============================================================================
    // 5. CREATE INSIGHT_CACHE TABLE
    // ============================================================================
    console.log('📝 Creating insight_cache table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS insight_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,

        -- Insight content
        insight_type TEXT NOT NULL,  -- 'pattern', 'correlation', 'prediction', 'recommendation'
        title TEXT,
        content TEXT NOT NULL,

        -- Context
        time_period_start TIMESTAMPTZ,
        time_period_end TIMESTAMPTZ,
        related_pattern_id UUID REFERENCES glucose_patterns(id) ON DELETE SET NULL,

        -- Metadata
        confidence DECIMAL,
        generated_by TEXT,  -- Which agent generated this
        data_hash TEXT,      -- Hash of data used to generate (for cache invalidation)

        -- Feedback
        user_found_helpful BOOLEAN,
        user_feedback TEXT,

        -- Lifecycle
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_insights_user_type ON insight_cache(user_id, insight_type);
      CREATE INDEX IF NOT EXISTS idx_insights_expiry ON insight_cache(expires_at) WHERE expires_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_insights_pattern ON insight_cache(related_pattern_id) WHERE related_pattern_id IS NOT NULL;

      -- Create trigger for updated_at
      DROP TRIGGER IF EXISTS update_insight_cache_updated_at ON insight_cache;
      CREATE TRIGGER update_insight_cache_updated_at
        BEFORE UPDATE ON insight_cache
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
    `);

    console.log('  ✓ Insight_cache table created');

    // ============================================================================
    // 6. CREATE AGENT_ANALYSIS_STATE TABLE
    // ============================================================================
    console.log('📝 Creating agent_analysis_state table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_analysis_state (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,

        agent_name TEXT NOT NULL,  -- 'pattern_detective', 'statistician', etc.

        -- State tracking
        last_analyzed_timestamp TIMESTAMPTZ,
        analysis_progress JSONB,  -- Agent-specific state

        -- Results summary
        patterns_found INTEGER DEFAULT 0,
        insights_generated INTEGER DEFAULT 0,
        last_significant_finding TEXT,

        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE(user_id, agent_name)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_state_user_agent ON agent_analysis_state(user_id, agent_name);

      -- Create trigger for updated_at
      DROP TRIGGER IF EXISTS update_agent_analysis_state_updated_at ON agent_analysis_state;
      CREATE TRIGGER update_agent_analysis_state_updated_at
        BEFORE UPDATE ON agent_analysis_state
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
    `);

    console.log('  ✓ Agent_analysis_state table created');

    // ============================================================================
    // 7. CREATE FOOD_DATABASE TABLE
    // ============================================================================
    console.log('📝 Creating food_database table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS food_database (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        serving_size TEXT,
        carbs_per_serving DECIMAL,
        protein_per_serving DECIMAL,
        fat_per_serving DECIMAL,
        calories_per_serving DECIMAL,
        glycemic_index DECIMAL,  -- How quickly it raises glucose
        source TEXT,  -- 'USDA', 'user_added', 'common_foods'

        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_food_name ON food_database(LOWER(name));
      CREATE INDEX IF NOT EXISTS idx_food_source ON food_database(source);

      -- Create trigger for updated_at
      DROP TRIGGER IF EXISTS update_food_database_updated_at ON food_database;
      CREATE TRIGGER update_food_database_updated_at
        BEFORE UPDATE ON food_database
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
    `);

    console.log('  ✓ Food_database table created');

    // ============================================================================
    // 8. SEED COMMON FOODS
    // ============================================================================
    console.log('📝 Seeding common foods...');

    await pool.query(`
      INSERT INTO food_database (name, serving_size, carbs_per_serving, protein_per_serving, fat_per_serving, calories_per_serving, glycemic_index, source)
      VALUES
        ('Bagel, plain', '1 medium (3.5 oz)', 50, 10, 2, 245, 72, 'common_foods'),
        ('Bread, white', '1 slice (1 oz)', 15, 2, 1, 75, 75, 'common_foods'),
        ('Bread, whole wheat', '1 slice (1 oz)', 12, 3, 1, 69, 69, 'common_foods'),
        ('Rice, white cooked', '1 cup', 45, 4, 0, 205, 73, 'common_foods'),
        ('Rice, brown cooked', '1 cup', 45, 5, 2, 216, 68, 'common_foods'),
        ('Pasta, cooked', '1 cup', 43, 8, 1, 220, 58, 'common_foods'),
        ('Potato, baked', '1 medium', 37, 4, 0, 161, 85, 'common_foods'),
        ('Sweet potato, baked', '1 medium', 27, 2, 0, 112, 63, 'common_foods'),
        ('Banana', '1 medium', 27, 1, 0, 105, 51, 'common_foods'),
        ('Apple', '1 medium', 25, 0, 0, 95, 36, 'common_foods'),
        ('Orange', '1 medium', 15, 1, 0, 62, 43, 'common_foods'),
        ('Oatmeal, cooked', '1 cup', 27, 6, 3, 154, 55, 'common_foods'),
        ('Milk, whole', '1 cup', 12, 8, 8, 149, 39, 'common_foods'),
        ('Yogurt, plain', '1 cup', 17, 14, 8, 190, 36, 'common_foods'),
        ('Pizza, cheese', '1 slice', 30, 12, 10, 285, 60, 'common_foods'),
        ('Chicken breast, cooked', '3 oz', 0, 26, 3, 140, 0, 'common_foods'),
        ('Egg', '1 large', 0, 6, 5, 70, 0, 'common_foods'),
        ('Peanut butter', '2 tbsp', 8, 8, 16, 190, 14, 'common_foods'),
        ('Beans, black cooked', '1 cup', 41, 15, 1, 227, 42, 'common_foods')
      ON CONFLICT DO NOTHING;
    `);

    console.log('  ✓ Common foods seeded');

    // ============================================================================
    // 9. ADD HELPFUL VIEWS
    // ============================================================================
    console.log('📝 Creating helpful views...');

    await pool.query(`
      -- View: Recent complete context for a user (glucose + meals + insulin + exercise)
      CREATE OR REPLACE VIEW user_complete_timeline AS
      SELECT
        'glucose' as event_type,
        user_id,
        id::text as event_id,
        timestamp,
        json_build_object(
          'glucose', glucose,
          'trend', trend,
          'device', device
        ) as details
      FROM glucose_readings

      UNION ALL

      SELECT
        'meal' as event_type,
        user_id,
        id::text as event_id,
        timestamp,
        json_build_object(
          'description', description,
          'carbs', estimated_carbs,
          'meal_type', meal_type,
          'confidence', carb_confidence
        ) as details
      FROM meals

      UNION ALL

      SELECT
        'insulin' as event_type,
        user_id,
        id::text as event_id,
        timestamp,
        json_build_object(
          'units', units,
          'type', insulin_type,
          'purpose', purpose,
          'brand', brand_name
        ) as details
      FROM insulin_doses

      UNION ALL

      SELECT
        'exercise' as event_type,
        user_id,
        id::text as event_id,
        timestamp,
        json_build_object(
          'description', description,
          'duration', duration_minutes,
          'intensity', intensity,
          'type', activity_type
        ) as details
      FROM exercise_logs

      ORDER BY timestamp DESC;
    `);

    console.log('  ✓ Views created');

    console.log('\n✅ Migration completed successfully!\n');
    console.log('Summary:');
    console.log('  • Enhanced meals table with nutrition tracking & learning');
    console.log('  • Enhanced exercise_logs table with impact tracking');
    console.log('  • Enhanced insulin_doses table with detailed logging');
    console.log('  • Created glucose_patterns table for pattern library');
    console.log('  • Created insight_cache table for agent insights');
    console.log('  • Created agent_analysis_state table for background agents');
    console.log('  • Created food_database table and seeded common foods');
    console.log('  • Created helpful views for unified timeline\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
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
