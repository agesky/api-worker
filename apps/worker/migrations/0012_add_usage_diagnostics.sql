ALTER TABLE usage_logs ADD COLUMN trace_id TEXT;
ALTER TABLE usage_logs ADD COLUMN failure_stage TEXT;
ALTER TABLE usage_logs ADD COLUMN failure_reason TEXT;
ALTER TABLE usage_logs ADD COLUMN usage_source TEXT;
ALTER TABLE usage_logs ADD COLUMN error_meta_json TEXT;

CREATE INDEX IF NOT EXISTS idx_usage_logs_trace_id
  ON usage_logs (trace_id);
