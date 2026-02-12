-- Migration: Add Pattern Detection Tables
-- Description: Creates tables for glucose pattern detection and correlations
-- Date: 2024-02-11

-- ============================================================================
-- glucose_correlations table
-- Stores correlations between events (meals, exercise) and glucose responses
-- ============================================================================

CREATE TABLE IF NOT EXISTS glucose_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Trigger event info
  trigger_event_type TEXT NOT NULL,  -- 'meal', 'exercise', etc.
  trigger_event_id UUID NOT NULL,
  trigger_timestamp TIMESTAMPTZ NOT NULL,

  -- Glucose response metrics
  baseline_glucose REAL NOT NULL,
  peak_glucose REAL,
  lowest_glucose REAL,
  time_to_peak_minutes INTEGER,
  time_to_lowest_minutes INTEGER,
  total_change REAL NOT NULL,
  time_in_range_pct REAL NOT NULL,

  -- Analysis window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  glucose_readings_count INTEGER NOT NULL DEFAULT 0,

  -- Pattern matching
  matched_pattern_id UUID,  -- Links to glucose_patterns table

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for glucose_correlations
CREATE INDEX IF NOT EXISTS idx_correlations_user_id ON glucose_correlations(user_id);
CREATE INDEX IF NOT EXISTS idx_correlations_trigger_event ON glucose_correlations(trigger_event_type, trigger_event_id);
CREATE INDEX IF NOT EXISTS idx_correlations_trigger_timestamp ON glucose_correlations(trigger_timestamp);
CREATE INDEX IF NOT EXISTS idx_correlations_pattern_id ON glucose_correlations(matched_pattern_id);

-- ============================================================================
-- glucose_patterns table
-- Stores detected patterns like meal responses, basal drift, exercise impact
-- ============================================================================

CREATE TABLE IF NOT EXISTS glucose_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Pattern identification
  pattern_type TEXT NOT NULL,  -- 'meal_response', 'basal_drift', 'exercise_response', etc.
  pattern_name TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Pattern characteristics
  typical_duration INTERVAL,
  typical_magnitude REAL,

  -- Timing (for time-based patterns like dawn phenomenon)
  time_of_day_start TIME,
  time_of_day_end TIME,

  -- Trigger info (for event-based patterns)
  trigger_event_type TEXT,  -- 'meal', 'exercise', etc.
  trigger_event_details JSONB,  -- e.g., meal_type, avg_carbs

  -- Pattern signature (for matching new events)
  signature JSONB NOT NULL,

  -- Examples and confidence
  example_event_ids TEXT[],
  example_values JSONB DEFAULT '[]'::jsonb,
  occurrence_count INTEGER DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 0.5,

  -- Metadata
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_occurred_at TIMESTAMPTZ
);

-- Indexes for glucose_patterns
CREATE INDEX IF NOT EXISTS idx_patterns_user_id ON glucose_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON glucose_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON glucose_patterns(confidence);
CREATE INDEX IF NOT EXISTS idx_patterns_updated_at ON glucose_patterns(updated_at);

-- Add foreign key from correlations to patterns
ALTER TABLE glucose_correlations
ADD CONSTRAINT fk_correlations_pattern
FOREIGN KEY (matched_pattern_id)
REFERENCES glucose_patterns(id)
ON DELETE SET NULL;

-- Add correlation_id column to meals and exercise_logs if not exists
ALTER TABLE meals
ADD COLUMN IF NOT EXISTS correlation_id UUID REFERENCES glucose_correlations(id) ON DELETE SET NULL;

ALTER TABLE exercise_logs
ADD COLUMN IF NOT EXISTS correlation_id UUID REFERENCES glucose_correlations(id) ON DELETE SET NULL;

-- Indexes for correlation_id lookups
CREATE INDEX IF NOT EXISTS idx_meals_correlation_id ON meals(correlation_id);
CREATE INDEX IF NOT EXISTS idx_exercise_correlation_id ON exercise_logs(correlation_id);

-- ============================================================================
-- Success message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Pattern detection tables created successfully!';
  RAISE NOTICE '   - glucose_correlations';
  RAISE NOTICE '   - glucose_patterns';
  RAISE NOTICE '   - Added correlation_id to meals and exercise_logs';
END $$;
