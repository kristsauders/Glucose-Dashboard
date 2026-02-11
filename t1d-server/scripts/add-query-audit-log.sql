-- Audit log for SQL query tool usage
-- This table tracks all SQL queries executed by the execute_sql_query tool
-- for monitoring, debugging, and security purposes

CREATE TABLE IF NOT EXISTS query_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_description TEXT NOT NULL,
  query_text TEXT NOT NULL,
  row_count INTEGER,
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding queries by user
CREATE INDEX IF NOT EXISTS idx_query_audit_user_id ON query_audit_log(user_id);

-- Index for time-based queries (finding recent queries)
CREATE INDEX IF NOT EXISTS idx_query_audit_executed_at ON query_audit_log(executed_at);

-- Add comment for documentation
COMMENT ON TABLE query_audit_log IS 'Audit log for all SQL queries executed by Sage agent via execute_sql_query tool';
COMMENT ON COLUMN query_audit_log.query_description IS 'Human-readable description of what the query analyzes';
COMMENT ON COLUMN query_audit_log.query_text IS 'The actual SQL query that was executed';
COMMENT ON COLUMN query_audit_log.row_count IS 'Number of rows returned (NULL if query failed)';
COMMENT ON COLUMN query_audit_log.error_message IS 'Error message if query failed (NULL if successful)';
