-- Database migration for Research Assistant feature
-- Creates tables for research topics, papers, and user reviews

-- Research topics table (standard topics for automated monitoring)
CREATE TABLE IF NOT EXISTS research_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  query TEXT NOT NULL,  -- Search query for this topic
  description TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_topics_last_checked ON research_topics(last_checked_at);

-- Insert standard diabetes research topics
INSERT INTO research_topics (name, query, description) VALUES
  ('LADA management', 'LADA OR "latent autoimmune diabetes" management treatment', 'Research on LADA-specific management strategies'),
  ('Dawn phenomenon', 'dawn phenomenon type 1 diabetes morning hyperglycemia', 'Studies on managing dawn phenomenon and morning glucose spikes'),
  ('CGM accuracy', 'continuous glucose monitor accuracy reliability', 'Research on CGM accuracy and reliability'),
  ('Time in range optimization', 'time in range diabetes optimization goals', 'Studies on optimizing time in range'),
  ('Basal insulin dosing', 'basal insulin dosing optimization timing', 'Research on basal insulin dosing strategies'),
  ('Exercise glucose management', 'exercise blood glucose type 1 diabetes physical activity', 'Studies on managing glucose during and after exercise'),
  ('Meal bolus timing', 'meal bolus insulin timing pre-bolus', 'Research on optimal meal insulin timing'),
  ('Hypoglycemia prevention', 'hypoglycemia prevention strategies type 1 diabetes', 'Studies on preventing and managing low blood sugar')
ON CONFLICT DO NOTHING;

-- Research papers table (stores discovered papers)
CREATE TABLE IF NOT EXISTS research_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,  -- PubMed ID, DOI, etc
  source TEXT NOT NULL,  -- 'pubmed', 'scholar', etc
  title TEXT NOT NULL,
  authors TEXT[],
  journal TEXT,
  published_date DATE,
  abstract TEXT,
  url TEXT,
  doi TEXT,
  summary JSONB,  -- AI-generated summary and analysis
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_papers_external_id ON research_papers(external_id);
CREATE INDEX IF NOT EXISTS idx_research_papers_published ON research_papers(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_research_papers_source ON research_papers(source);

-- User research reviews (tracks which papers have been shared with users)
CREATE TABLE IF NOT EXISTS user_research_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_id UUID NOT NULL REFERENCES research_papers(id) ON DELETE CASCADE,
  relevance_score FLOAT,  -- 0.0 to 1.0
  relevance_reasons TEXT[],  -- Why this paper is relevant to user
  shared_via_proactive BOOLEAN DEFAULT FALSE,
  shared_at TIMESTAMPTZ,
  user_feedback TEXT,  -- 'helpful', 'not-relevant', 'saved', etc
  notes TEXT,  -- User's notes on the paper
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, paper_id)
);

CREATE INDEX IF NOT EXISTS idx_user_research_reviews_user ON user_research_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_user_research_reviews_paper ON user_research_reviews(paper_id);
CREATE INDEX IF NOT EXISTS idx_user_research_reviews_relevance ON user_research_reviews(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_research_reviews_shared ON user_research_reviews(shared_at DESC) WHERE shared_via_proactive = TRUE;

-- Research requests table (on-demand research requests from users)
CREATE TABLE IF NOT EXISTS research_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
  results_summary TEXT,
  papers_found INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_requests_user ON research_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_research_requests_status ON research_requests(status, created_at);

-- Add research preferences to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS research_preferences JSONB DEFAULT '{
  "enabled": true,
  "frequency": "biweekly",
  "topics": [],
  "max_papers_per_week": 2
}'::jsonb;

-- Research monitoring state table (tracks last check times)
CREATE TABLE IF NOT EXISTS research_monitoring_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_scheduled_check TIMESTAMPTZ,
  last_successful_check TIMESTAMPTZ,
  next_scheduled_check TIMESTAMPTZ,
  papers_discovered_last_run INTEGER DEFAULT 0,
  users_notified_last_run INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial monitoring state
INSERT INTO research_monitoring_state (last_scheduled_check, next_scheduled_check)
VALUES (NOW(), NOW() + INTERVAL '2.5 days')
ON CONFLICT DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE research_topics IS 'Standard research topics for automated monitoring';
COMMENT ON TABLE research_papers IS 'Discovered research papers from various sources';
COMMENT ON TABLE user_research_reviews IS 'Tracks which papers have been reviewed and shared with users';
COMMENT ON TABLE research_requests IS 'On-demand research requests from users';
COMMENT ON TABLE research_monitoring_state IS 'Tracks research monitoring schedule and status';
