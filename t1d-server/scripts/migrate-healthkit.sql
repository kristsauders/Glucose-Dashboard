-- HealthKit integration migration
-- Adds heart rate, calories, and dedup UUID columns to exercise_logs.
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING).

ALTER TABLE exercise_logs
  ADD COLUMN IF NOT EXISTS avg_heart_rate  INTEGER,
  ADD COLUMN IF NOT EXISTS max_heart_rate  INTEGER,
  ADD COLUMN IF NOT EXISTS calories        NUMERIC,
  ADD COLUMN IF NOT EXISTS healthkit_uuid  TEXT;

-- Partial unique index: prevent re-importing the same HealthKit workout.
-- NULL healthkit_uuid (manually logged exercises) are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_healthkit_uuid
  ON exercise_logs (user_id, healthkit_uuid)
  WHERE healthkit_uuid IS NOT NULL;

-- Add activity_type and description columns to exercise_logs if they don't
-- already exist (schema.sql only has 'type'; later migrations may have added
-- activity_type/description — this is safe either way).
ALTER TABLE exercise_logs
  ADD COLUMN IF NOT EXISTS activity_type TEXT,
  ADD COLUMN IF NOT EXISTS description   TEXT;

-- Index to speed up healthkit sync dedup query (check existing exercise in ±5 min window)
CREATE INDEX IF NOT EXISTS idx_exercise_user_ts_activity
  ON exercise_logs (user_id, timestamp, activity_type);
