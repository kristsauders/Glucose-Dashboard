-- Add Apple Health integration support to exercise_logs
-- Adds workout_id column to store Apple Health workout UUID for deduplication

-- Add column to store Apple Health workout UUID
ALTER TABLE exercise_logs
ADD COLUMN IF NOT EXISTS workout_id TEXT;

-- Create unique index to prevent duplicate imports from Apple Health
-- Ensures each workout is only imported once per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_apple_health_dedup
ON exercise_logs(user_id, workout_id);

-- Add index for workout_id lookups
CREATE INDEX IF NOT EXISTS idx_exercise_workout_id
ON exercise_logs(workout_id)
WHERE workout_id IS NOT NULL;

-- Verify migration
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'exercise_logs' AND column_name = 'workout_id';
