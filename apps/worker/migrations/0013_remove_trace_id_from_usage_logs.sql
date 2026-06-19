CREATE TABLE usage_logs_new (
  id TEXT PRIMARY KEY,
  token_id TEXT,
  channel_id TEXT,
  model TEXT,
  request_path TEXT,
  total_tokens INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost REAL,
  latency_ms INTEGER,
  first_token_latency_ms INTEGER,
  stream INTEGER,
  reasoning_effort TEXT,
  status TEXT,
  upstream_status INTEGER,
  error_code TEXT,
  error_message TEXT,
  failure_stage TEXT,
  failure_reason TEXT,
  usage_source TEXT,
  error_meta_json TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO usage_logs_new (
  id,
  token_id,
  channel_id,
  model,
  request_path,
  total_tokens,
  prompt_tokens,
  completion_tokens,
  cost,
  latency_ms,
  first_token_latency_ms,
  stream,
  reasoning_effort,
  status,
  upstream_status,
  error_code,
  error_message,
  failure_stage,
  failure_reason,
  usage_source,
  error_meta_json,
  created_at
)
SELECT
  id,
  token_id,
  channel_id,
  model,
  request_path,
  total_tokens,
  prompt_tokens,
  completion_tokens,
  cost,
  latency_ms,
  first_token_latency_ms,
  stream,
  reasoning_effort,
  status,
  upstream_status,
  error_code,
  error_message,
  failure_stage,
  failure_reason,
  usage_source,
  error_meta_json,
  created_at
FROM usage_logs;

DROP TABLE usage_logs;
ALTER TABLE usage_logs_new RENAME TO usage_logs;

CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_channel_id ON usage_logs (channel_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_token_id ON usage_logs (token_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON usage_logs (model);
CREATE INDEX IF NOT EXISTS idx_usage_logs_status ON usage_logs (status);
CREATE INDEX IF NOT EXISTS idx_usage_logs_upstream_status ON usage_logs (upstream_status);
CREATE INDEX IF NOT EXISTS idx_usage_logs_token_created_at ON usage_logs (token_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_channel_created_at ON usage_logs (channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_model_created_at ON usage_logs (model, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_upstream_status_created_at ON usage_logs (upstream_status, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_status_created_at ON usage_logs (status, created_at);
