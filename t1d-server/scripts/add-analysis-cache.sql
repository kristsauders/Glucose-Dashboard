-- Analysis cache table for pre-computed extended pattern metrics
-- Stores results from pattern-algorithms-extended.ts algorithms
-- Each analysis_type has one current result per user (upserted on each run)

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

-- One current result per user per analysis type (newest wins)
CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_cache_user_type_unique
  ON analysis_cache(user_id, analysis_type);

-- For time-series queries
CREATE INDEX IF NOT EXISTS idx_analysis_cache_computed
  ON analysis_cache(user_id, computed_at DESC);
