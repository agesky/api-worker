DROP TABLE IF EXISTS runtime_events;

DELETE FROM settings
WHERE key IN (
  'runtime_event_retention_days',
  'runtime_event_levels',
  'runtime_event_context_max_length'
);

