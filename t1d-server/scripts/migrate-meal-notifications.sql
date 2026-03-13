-- Migration: meal notification tracking fields
-- Adds columns needed for the meal detection notification + insulin follow-up flow.

ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS confirmed_at                  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed                     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS detection_notification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS insulin_followup_sent_at       TIMESTAMPTZ;

-- Index to efficiently find meals that need an insulin follow-up notification:
-- sage_detected, notification sent 25-35 min ago, follow-up not yet sent, not dismissed.
CREATE INDEX IF NOT EXISTS idx_meals_insulin_followup
  ON meals (user_id, detection_notification_sent_at)
  WHERE source = 'sage_detected'
    AND dismissed = FALSE
    AND insulin_followup_sent_at IS NULL;
