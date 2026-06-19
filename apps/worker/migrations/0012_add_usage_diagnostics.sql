ALTER TABLE usage_logs ADD COLUMN failure_stage TEXT;
ALTER TABLE usage_logs ADD COLUMN failure_reason TEXT;
ALTER TABLE usage_logs ADD COLUMN usage_source TEXT;
ALTER TABLE usage_logs ADD COLUMN error_meta_json TEXT;
