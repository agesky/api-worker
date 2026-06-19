CREATE TABLE IF NOT EXISTS attempt_events (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  attempt_index INTEGER NOT NULL,
  channel_id TEXT,
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL,
  error_class TEXT,
  error_code TEXT,
  http_status INTEGER,
  latency_ms INTEGER NOT NULL,
  upstream_request_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  raw_size_bytes INTEGER,
  raw_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempt_events_trace_attempt
  ON attempt_events (trace_id, attempt_index);

CREATE INDEX IF NOT EXISTS idx_attempt_events_created_at
  ON attempt_events (created_at);

CREATE INDEX IF NOT EXISTS idx_attempt_events_channel_created_at
  ON attempt_events (channel_id, created_at);

CREATE INDEX IF NOT EXISTS idx_attempt_events_status_created_at
  ON attempt_events (status, created_at);

