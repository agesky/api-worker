UPDATE model_registry
SET
  import_regex = '^(?:openai/)?gpt-5(?:-chat(?:-latest)?)?(?:-\d{4}-\d{2}-\d{2})?$',
  updated_at = CURRENT_TIMESTAMP
WHERE
  canonical_model = 'openai/gpt-5'
  AND import_regex IN (
    '^(?:openai/)?gpt-5(?:\.\d+)?(?:-chat(?:-latest)?)?(?:-\d{4}-\d{2}-\d{2})?$',
    '^(?:openai/)?gpt-5(?:\.\d+)*(?:-chat(?:-latest)?)?(?:-\d{4}-\d{2}-\d{2})?$'
  );

UPDATE model_registry
SET
  import_regex = '^(?:openai/)?gpt-5-mini(?:-\d{4}-\d{2}-\d{2})?$',
  updated_at = CURRENT_TIMESTAMP
WHERE
  canonical_model = 'openai/gpt-5-mini'
  AND import_regex IN (
    '^(?:openai/)?gpt-5(?:\.\d+)?-mini(?:-\d{4}-\d{2}-\d{2})?$',
    '^(?:openai/)?gpt-5(?:\.\d+)*-mini(?:-\d{4}-\d{2}-\d{2})?$'
  );

UPDATE model_registry
SET
  import_regex = '^(?:openai/)?gpt-5-nano(?:-\d{4}-\d{2}-\d{2})?$',
  updated_at = CURRENT_TIMESTAMP
WHERE
  canonical_model = 'openai/gpt-5-nano'
  AND import_regex IN (
    '^(?:openai/)?gpt-5(?:\.\d+)?-nano(?:-\d{4}-\d{2}-\d{2})?$',
    '^(?:openai/)?gpt-5(?:\.\d+)*-nano(?:-\d{4}-\d{2}-\d{2})?$'
  );

UPDATE model_registry
SET
  import_regex = '^(?:openai/)?gpt-5-codex(?:-(?:mini|max|spark))?$',
  updated_at = CURRENT_TIMESTAMP
WHERE
  canonical_model = 'openai/gpt-5-codex'
  AND import_regex IN (
    '^(?:openai/)?gpt-5(?:\.\d+)?-codex(?:-(?:mini|max|spark))?$',
    '^(?:openai/)?gpt-5(?:\.\d+)*-codex(?:-(?:mini|max|spark))?$'
  );

INSERT INTO model_registry (canonical_model, display_name, provider_hint, import_regex, created_at, updated_at)
VALUES
  ('openai/gpt-5-pro', 'openai/gpt-5-pro', NULL, '^(?:openai/)?gpt-5-pro(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.1', 'openai/gpt-5.1', NULL, '^(?:openai/)?gpt-5\.1(?:\.\d+)*(?:-chat(?:-latest)?)?(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.1-codex', 'openai/gpt-5.1-codex', NULL, '^(?:openai/)?gpt-5\.1(?:\.\d+)*-codex$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.1-codex-mini', 'openai/gpt-5.1-codex-mini', NULL, '^(?:openai/)?gpt-5\.1(?:\.\d+)*-codex-mini$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.1-codex-max', 'openai/gpt-5.1-codex-max', NULL, '^(?:openai/)?gpt-5\.1(?:\.\d+)*-codex-max$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.2', 'openai/gpt-5.2', NULL, '^(?:openai/)?gpt-5\.2(?:\.\d+)*(?:-chat(?:-latest)?)?(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.2-pro', 'openai/gpt-5.2-pro', NULL, '^(?:openai/)?gpt-5\.2(?:\.\d+)*-pro(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.2-codex', 'openai/gpt-5.2-codex', NULL, '^(?:openai/)?gpt-5\.2(?:\.\d+)*-codex$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.4', 'openai/gpt-5.4', NULL, '^(?:openai/)?gpt-5\.4(?:\.\d+)*(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.4-mini', 'openai/gpt-5.4-mini', NULL, '^(?:openai/)?gpt-5\.4(?:\.\d+)*-mini(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.4-nano', 'openai/gpt-5.4-nano', NULL, '^(?:openai/)?gpt-5\.4(?:\.\d+)*-nano(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.4-pro', 'openai/gpt-5.4-pro', NULL, '^(?:openai/)?gpt-5\.4(?:\.\d+)*-pro(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.5', 'openai/gpt-5.5', NULL, '^(?:openai/)?gpt-5\.5(?:\.\d+)*(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.5-pro', 'openai/gpt-5.5-pro', NULL, '^(?:openai/)?gpt-5\.5(?:\.\d+)*-pro(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(canonical_model) DO UPDATE SET
  import_regex = CASE
    WHEN model_registry.import_regex IS NULL OR TRIM(model_registry.import_regex) = ''
      THEN excluded.import_regex
    ELSE model_registry.import_regex
  END,
  updated_at = CASE
    WHEN model_registry.import_regex IS NULL OR TRIM(model_registry.import_regex) = ''
      THEN excluded.updated_at
    ELSE model_registry.updated_at
  END;

INSERT INTO model_aliases (alias, provider_hint, canonical_model, created_at, updated_at)
VALUES
  ('openai/gpt-5-pro', '', 'openai/gpt-5-pro', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.1', '', 'openai/gpt-5.1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.1-codex', '', 'openai/gpt-5.1-codex', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.1-codex-mini', '', 'openai/gpt-5.1-codex-mini', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.1-codex-max', '', 'openai/gpt-5.1-codex-max', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.2', '', 'openai/gpt-5.2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.2-pro', '', 'openai/gpt-5.2-pro', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.2-codex', '', 'openai/gpt-5.2-codex', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.4', '', 'openai/gpt-5.4', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.4-mini', '', 'openai/gpt-5.4-mini', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.4-nano', '', 'openai/gpt-5.4-nano', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.4-pro', '', 'openai/gpt-5.4-pro', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.5', '', 'openai/gpt-5.5', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.5-pro', '', 'openai/gpt-5.5-pro', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(alias, provider_hint) DO NOTHING;
