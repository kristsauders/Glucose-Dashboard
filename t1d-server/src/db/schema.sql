-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  libreview_email TEXT,
  libreview_password_encrypted TEXT,
  libreview_region TEXT DEFAULT 'us',
  diagnosis_date DATE,
  diagnosis_type TEXT,
  timezone TEXT DEFAULT 'America/Los_Angeles',
  discord_user_id TEXT UNIQUE,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Glucose readings
CREATE TABLE IF NOT EXISTS glucose_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  glucose NUMERIC NOT NULL,
  device TEXT,
  record_type INTEGER,
  trend INTEGER,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, timestamp, source)
);
CREATE INDEX IF NOT EXISTS idx_glucose_user_time ON glucose_readings(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_glucose_timestamp ON glucose_readings(timestamp DESC);

-- Meals
CREATE TABLE IF NOT EXISTS meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  description TEXT,
  carbs NUMERIC,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meals_user_time ON meals(user_id, timestamp DESC);

-- Insulin doses
CREATE TABLE IF NOT EXISTS insulin_doses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT,
  units NUMERIC NOT NULL,
  insulin_type TEXT,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insulin_user_time ON insulin_doses(user_id, timestamp DESC);

-- Exercise logs
CREATE TABLE IF NOT EXISTS exercise_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  type TEXT,
  intensity TEXT,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exercise_user_time ON exercise_logs(user_id, timestamp DESC);

-- AI insights
CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT,
  data JSONB,
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insights_user_created ON insights(user_id, created_at DESC);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_user_time ON chat_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversation ON chat_messages(conversation_id, created_at ASC);

-- Agent memory
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Trigger for agent_memory table
DROP TRIGGER IF EXISTS update_agent_memory_updated_at ON agent_memory;
CREATE TRIGGER update_agent_memory_updated_at
  BEFORE UPDATE ON agent_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Trigger for conversations table
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Sage proactive messages
CREATE TABLE IF NOT EXISTS sage_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'insight', 'question', 'suggestion', 'daily_summary'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB, -- Additional data like glucose values, patterns, etc.
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sage_messages_user_sent ON sage_messages(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sage_messages_type ON sage_messages(user_id, type, sent_at DESC);

-- Glucose monitoring state
CREATE TABLE IF NOT EXISTS glucose_monitoring_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_check_timestamp TIMESTAMPTZ,
  last_message_sent_at TIMESTAMPTZ,
  last_daily_summary_at TIMESTAMPTZ,
  state JSONB DEFAULT '{}', -- Store pattern detection state, cooldowns, etc.
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for glucose_monitoring_state table
DROP TRIGGER IF EXISTS update_glucose_monitoring_state_updated_at ON glucose_monitoring_state;
CREATE TRIGGER update_glucose_monitoring_state_updated_at
  BEFORE UPDATE ON glucose_monitoring_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
