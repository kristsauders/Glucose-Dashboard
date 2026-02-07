-- Migration: Report Export System
-- Adds support for generating and storing medical reports

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('general', 'comparison', 'decision-support')),
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  comparison_range_start DATE,
  comparison_range_end DATE,
  config JSONB, -- Report configuration (sections, focus areas, etc)
  file_path TEXT, -- Path to generated PDF
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'error')),
  error_message TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX idx_reports_status ON reports(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reports_updated_at_trigger
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION update_reports_updated_at();

-- Insert sample report types metadata (optional)
COMMENT ON TABLE reports IS 'Generated medical reports for sharing with healthcare providers';
COMMENT ON COLUMN reports.report_type IS 'Type: general (overview), comparison (before/after), decision-support (specific question)';
COMMENT ON COLUMN reports.config IS 'JSON configuration: { sections: [], focusAreas: [], notes: "" }';
COMMENT ON COLUMN reports.file_path IS 'Relative path to generated PDF file in storage';
