-- Migration: Add Web Push Notification Support
-- Date: 2026-02-04
-- Purpose: Enable web push notifications for proactive messages

-- Add conversation_id to sage_messages to link proactive messages to conversations
ALTER TABLE sage_messages
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sage_messages_conversation_id ON sage_messages(conversation_id);

-- Add push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  keys JSONB NOT NULL, -- {p256dh: string, auth: string}
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Add notification preferences to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"proactive_enabled": true, "frequency": "normal"}'::jsonb;

-- Verify migration
SELECT 'Migration completed successfully!' AS status;
