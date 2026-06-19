INSERT INTO model_registry (canonical_model, display_name, provider_hint, import_regex, created_at, updated_at)
VALUES
  ('anthropic/claude-opus-4.8', 'anthropic/claude-opus-4.8', NULL, '^(?:anthropic/)?claude-opus-4(?:[.-]8)(?:-\d{8})?(?:-(?:thinking|fast))?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen-max', 'alibaba/qwen-max', NULL, '^(?:alibaba/)?qwen-max(?:-(?:latest|\d{4}-\d{2}-\d{2}))?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen-plus', 'alibaba/qwen-plus', NULL, '^(?:alibaba/)?qwen-plus(?:-(?:latest|\d{4}-\d{2}-\d{2}))?(?:-us)?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen-flash', 'alibaba/qwen-flash', NULL, '^(?:alibaba/)?qwen-flash(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen-turbo', 'alibaba/qwen-turbo', NULL, '^(?:alibaba/)?qwen-turbo(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen-long', 'alibaba/qwen-long', NULL, '^(?:alibaba/)?qwen-long(?:-(?:latest|\d{4}-\d{2}-\d{2}))?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-max', 'alibaba/qwen3-max', NULL, '^(?:alibaba/)?qwen3-max(?:-(?:preview|\d{4}-\d{2}-\d{2}))?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-coder', 'alibaba/qwen3-coder', NULL, '^(?:alibaba/)?qwen3-coder(?:-(?!(?:plus|flash|next|480b-a35b)\b)[\w.-]+)?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-coder-flash', 'alibaba/qwen3-coder-flash', NULL, '^(?:alibaba/)?qwen3-coder-flash(?:-\d{4}-\d{2}-\d{2})?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-coder-next', 'alibaba/qwen3-coder-next', NULL, '^(?:alibaba/)?qwen3-coder-next$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-coder-480b-a35b', 'alibaba/qwen3-coder-480b-a35b', NULL, '^(?:(?:alibaba|qwen)/)?qwen3-coder-480b-a35b(?:-instruct)?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-235b-a22b', 'alibaba/qwen3-235b-a22b', NULL, '^(?:(?:alibaba|qwen)/)?qwen3-235b-a22b(?:-(?:instruct|thinking(?:-\d{4})?))?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-vl-plus', 'alibaba/qwen3-vl-plus', NULL, '^(?:(?:alibaba|qwen)/)?qwen3-vl-plus$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3.5-122b-a10b', 'alibaba/qwen3.5-122b-a10b', NULL, '^(?:(?:alibaba|qwen)/)?qwen3\.5-122b-a10b$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3.5-plus', 'alibaba/qwen3.5-plus', NULL, '^(?:(?:alibaba|qwen)/)?qwen3\.5-plus(?:-(?:search|thinking|image|image-edit))?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwq-32b', 'alibaba/qwq-32b', NULL, '^(?:(?:alibaba|qwen)/)?qwq-32b$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('moonshot/kimi-k2', 'moonshot/kimi-k2', NULL, '^(?:moonshot/)?kimi-k2(?:-(?:\d{4}-preview|turbo-preview|thinking(?:-turbo)?|instruct(?:-[\w.-]+)?))?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('moonshot/moonshot-v1-32k', 'moonshot/moonshot-v1-32k', NULL, '^(?:moonshot/)?moonshot-v1-32k$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('moonshot/moonshot-v1-128k', 'moonshot/moonshot-v1-128k', NULL, '^(?:moonshot/)?moonshot-v1-128k$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('minimax/minimax-m2', 'minimax/minimax-m2', NULL, '^(?:(?:minimax|minimaxai)/)?minimax-m2(?:[-:][\w-]+)*$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('minimax/minimax-m2.1', 'minimax/minimax-m2.1', NULL, '^(?:(?:minimax|minimaxai)/)?minimax-m2\.1(?:[-:][\w.]+)*$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(canonical_model) DO UPDATE SET
  import_regex = CASE
    WHEN model_registry.import_regex IS NULL OR TRIM(model_registry.import_regex) = ''
      THEN excluded.import_regex
    WHEN model_registry.canonical_model = 'alibaba/qwen-max'
      AND model_registry.import_regex = '^(?:alibaba/)?qwen-max(?:-\d{4}-\d{2}-\d{2})?$'
      THEN excluded.import_regex
    WHEN model_registry.canonical_model = 'alibaba/qwen-plus'
      AND model_registry.import_regex = '^(?:alibaba/)?qwen-plus(?:-\d{4}-\d{2}-\d{2})?$'
      THEN excluded.import_regex
    WHEN model_registry.canonical_model = 'alibaba/qwen3-coder'
      AND (
        model_registry.import_regex = '^(?:alibaba/)?qwen3-coder(?:-[\w.-]+)?$'
        OR model_registry.import_regex = '^(?:alibaba/)?qwen3-coder(?:-(?!plus\b)[\w.-]+)?$'
        OR model_registry.import_regex = '^(?:alibaba/)?qwen3-coder(?:-(?!plus\b|flash\b|next\b)[\w.-]+)?$'
      )
      THEN excluded.import_regex
    WHEN model_registry.canonical_model = 'moonshot/kimi-k2'
      AND (
        model_registry.import_regex = '^(?:moonshot/)?kimi-k2$'
        OR model_registry.import_regex = '^(?:moonshot/)?kimi-k2(?:-(?:thinking|instruct(?:-[\w.-]+)?))?$'
      )
      THEN excluded.import_regex
    ELSE model_registry.import_regex
  END,
  updated_at = CASE
    WHEN model_registry.import_regex IS NULL OR TRIM(model_registry.import_regex) = ''
      THEN excluded.updated_at
    WHEN model_registry.canonical_model = 'alibaba/qwen-max'
      AND model_registry.import_regex = '^(?:alibaba/)?qwen-max(?:-\d{4}-\d{2}-\d{2})?$'
      THEN excluded.updated_at
    WHEN model_registry.canonical_model = 'alibaba/qwen-plus'
      AND model_registry.import_regex = '^(?:alibaba/)?qwen-plus(?:-\d{4}-\d{2}-\d{2})?$'
      THEN excluded.updated_at
    WHEN model_registry.canonical_model = 'alibaba/qwen3-coder'
      AND (
        model_registry.import_regex = '^(?:alibaba/)?qwen3-coder(?:-[\w.-]+)?$'
        OR model_registry.import_regex = '^(?:alibaba/)?qwen3-coder(?:-(?!plus\b)[\w.-]+)?$'
        OR model_registry.import_regex = '^(?:alibaba/)?qwen3-coder(?:-(?!plus\b|flash\b|next\b)[\w.-]+)?$'
      )
      THEN excluded.updated_at
    WHEN model_registry.canonical_model = 'moonshot/kimi-k2'
      AND (
        model_registry.import_regex = '^(?:moonshot/)?kimi-k2$'
        OR model_registry.import_regex = '^(?:moonshot/)?kimi-k2(?:-(?:thinking|instruct(?:-[\w.-]+)?))?$'
      )
      THEN excluded.updated_at
    ELSE model_registry.updated_at
  END;

INSERT INTO model_aliases (alias, provider_hint, canonical_model, created_at, updated_at)
VALUES
  ('anthropic/claude-opus-4.8', '', 'anthropic/claude-opus-4.8', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen-flash', '', 'alibaba/qwen-flash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen-turbo', '', 'alibaba/qwen-turbo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen-long', '', 'alibaba/qwen-long', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-max', '', 'alibaba/qwen3-max', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-coder-480b-a35b', '', 'alibaba/qwen3-coder-480b-a35b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-coder-flash', '', 'alibaba/qwen3-coder-flash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-coder-next', '', 'alibaba/qwen3-coder-next', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-235b-a22b', '', 'alibaba/qwen3-235b-a22b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-vl-plus', '', 'alibaba/qwen3-vl-plus', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3.5-122b-a10b', '', 'alibaba/qwen3.5-122b-a10b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3.5-plus', '', 'alibaba/qwen3.5-plus', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwq-32b', '', 'alibaba/qwq-32b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('moonshot/moonshot-v1-32k', '', 'moonshot/moonshot-v1-32k', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('moonshot/moonshot-v1-128k', '', 'moonshot/moonshot-v1-128k', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('minimax/minimax-m2', '', 'minimax/minimax-m2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('minimax/minimax-m2.1', '', 'minimax/minimax-m2.1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(alias, provider_hint) DO NOTHING;
