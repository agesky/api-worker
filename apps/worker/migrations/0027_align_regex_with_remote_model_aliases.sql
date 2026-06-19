UPDATE model_registry
SET import_regex = '^(?:openai/)?gpt-5(?:(?:-chat(?:-latest)?|-(?:high|low|medium)|-\d{4}-\d{2}-\d{2}))?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'openai/gpt-5';

UPDATE model_registry
SET import_regex = '^(?:openai/)?gpt-5-codex(?:(?:-(?:high|low|medium|spark))?(?:-openai-compact)?)?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'openai/gpt-5-codex';

INSERT INTO model_registry (canonical_model, display_name, provider_hint, import_regex, created_at, updated_at)
VALUES
  ('openai/gpt-5-codex-mini', 'openai/gpt-5-codex-mini', NULL, '^(?:openai/)?gpt-5-codex-mini(?:(?:-(?:high|low|medium))?(?:-openai-compact)?)?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.3-codex', 'openai/gpt-5.3-codex', NULL, '^(?:openai/)?gpt-5\.3(?:\.\d+)*-codex(?:(?:-(?:spark|high|low|medium|xhigh))?(?:-openai-compact)?|\((?:high|low|medium|xhigh)\))$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-235b-a22b', 'alibaba/qwen3-235b-a22b', NULL, '^(?:(?:alibaba|qwen)/)?qwen3-235b-a22b(?:-(?:instruct|thinking(?:-\d{4})?))?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-coder-480b-a35b', 'alibaba/qwen3-coder-480b-a35b', NULL, '^(?:(?:alibaba|qwen)/)?qwen3-coder-480b-a35b(?:-instruct)?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-vl-plus', 'alibaba/qwen3-vl-plus', NULL, '^(?:(?:alibaba|qwen)/)?qwen3-vl-plus$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3.5-122b-a10b', 'alibaba/qwen3.5-122b-a10b', NULL, '^(?:(?:alibaba|qwen)/)?qwen3\.5-122b-a10b$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3.5-plus', 'alibaba/qwen3.5-plus', NULL, '^(?:(?:alibaba|qwen)/)?qwen3\.5-plus(?:-(?:search|thinking|image|image-edit))?$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwq-32b', 'alibaba/qwq-32b', NULL, '^(?:(?:alibaba|qwen)/)?qwq-32b$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('minimax/minimax-m2', 'minimax/minimax-m2', NULL, '^(?:(?:minimax|minimaxai)/)?minimax-m2(?:[-:][\w-]+)*$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(canonical_model) DO UPDATE SET
  import_regex = excluded.import_regex,
  updated_at = excluded.updated_at;

UPDATE model_registry
SET import_regex = '^(?:openai/)?gpt-5\.1(?:\.\d+)*(?:(?:-chat(?:-latest)?|-high|-\d{4}-\d{2}-\d{2}))?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'openai/gpt-5.1';

UPDATE model_registry
SET import_regex = '^(?:openai/)?gpt-5\.1(?:\.\d+)*-codex(?:-openai-compact)?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'openai/gpt-5.1-codex';

UPDATE model_registry
SET import_regex = '^(?:openai/)?gpt-5\.1(?:\.\d+)*-codex-mini(?:-openai-compact)?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'openai/gpt-5.1-codex-mini';

UPDATE model_registry
SET import_regex = '^(?:openai/)?gpt-5\.1(?:\.\d+)*-codex-max(?:-openai-compact)?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'openai/gpt-5.1-codex-max';

UPDATE model_registry
SET import_regex = '^(?:openai/)?gpt-5\.2(?:\.\d+)*(?:(?:-chat(?:-latest)?|-(?:high|low|medium|xhigh|openai-compact)|\((?:auto|high|low|medium|xhigh)\)|-\d{4}-\d{2}-\d{2}))*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'openai/gpt-5.2';

UPDATE model_registry
SET import_regex = '^(?:openai/)?gpt-5\.2(?:\.\d+)*-codex(?:-openai-compact)?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'openai/gpt-5.2-codex';

UPDATE model_registry
SET import_regex = '^(?:openai/)?gpt-5\.4(?:\.\d+)*(?:(?:-(?:high|low|medium|xhigh|openai-compact)|\((?:high|low|medium|xhigh)\)|-\d{4}-\d{2}-\d{2}))*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'openai/gpt-5.4';

UPDATE model_registry
SET import_regex = '^(?:(?:deepseek|deepseek-ai)/)?deepseek-chat(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'deepseek/deepseek-chat';

UPDATE model_registry
SET import_regex = '^(?:(?:deepseek|deepseek-ai)/)?deepseek-reasoner(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'deepseek/deepseek-reasoner';

UPDATE model_registry
SET import_regex = '^(?:(?:deepseek|deepseek-ai)/)?deepseek-r1(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'deepseek/deepseek-r1';

UPDATE model_registry
SET import_regex = '^(?:(?:deepseek|deepseek-ai)/)?deepseek-v3(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'deepseek/deepseek-v3';

UPDATE model_registry
SET import_regex = '^(?:(?:deepseek|deepseek-ai)/)?deepseek-v3(?:[.-]1)(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'deepseek/deepseek-v3.1';

UPDATE model_registry
SET import_regex = '^(?:(?:deepseek|deepseek-ai)/)?deepseek-v3(?:[.-]2)(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'deepseek/deepseek-v3.2';

UPDATE model_registry
SET import_regex = '^(?:(?:alibaba|qwen)/)?qwen-max(?:-(?:latest|\d{4}-\d{2}-\d{2}))?(?:-(?:thinking|search))*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'alibaba/qwen-max';

UPDATE model_registry
SET import_regex = '^(?:(?:alibaba|qwen)/)?qwen-plus(?:-(?:latest|\d{4}-\d{2}-\d{2}))?(?:-us)?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'alibaba/qwen-plus';

UPDATE model_registry
SET import_regex = '^(?:(?:alibaba|qwen)/)?qwen3-max(?:-(?:preview|\d{4}-\d{2}-\d{2}))?(?:-thinking)?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'alibaba/qwen3-max';

UPDATE model_registry
SET import_regex = '^(?:(?:alibaba|qwen)/)?qwen3-coder-plus(?:-(?:thinking|search))*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'alibaba/qwen3-coder-plus';

UPDATE model_registry
SET import_regex = '^(?:(?:alibaba|qwen)/)?qwen3-coder(?:-(?!(?:plus|flash|next|480b-a35b)\b)[\w.-]+)?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'alibaba/qwen3-coder';

UPDATE model_registry
SET import_regex = '^(?:(?:alibaba|qwen)/)?qwen3-coder-flash(?:-\d{4}-\d{2}-\d{2})?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'alibaba/qwen3-coder-flash';

UPDATE model_registry
SET import_regex = '^(?:(?:alibaba|qwen)/)?qwen3-coder-next(?:-thinking)?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'alibaba/qwen3-coder-next';

UPDATE model_registry
SET import_regex = '^(?:(?:alibaba|qwen)/)?qwen3\.5-397b-a17b(?:-(?:thinking|t))?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'alibaba/qwen3.5-397b-a17b';

UPDATE model_registry
SET import_regex = '^(?:(?:alibaba|qwen)/)?qwen3\.5-plus(?:-(?:search|thinking|image|image-edit))?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'alibaba/qwen3.5-plus';

UPDATE model_registry
SET import_regex = '^(?:(?:alibaba|qwen)/)?qwen3-next-80b-a3b(?:-(?:instruct|thinking))?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'alibaba/qwen3-next-80b-a3b';

UPDATE model_registry
SET import_regex = '^(?:(?:moonshot|moonshotai)/)?kimi-k2(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'moonshot/kimi-k2';

UPDATE model_registry
SET import_regex = '^(?:(?:moonshot|moonshotai)/)?kimi-k2\.5(?:[-:][\w.\[\]]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'moonshot/kimi-k2.5';

UPDATE model_registry
SET import_regex = '^(?:moonshot/)?moonshot-v1-32k(?:-[\w.-]+)?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'moonshot/moonshot-v1-32k';

UPDATE model_registry
SET import_regex = '^(?:moonshot/)?moonshot-v1-128k(?:-[\w.-]+)?$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'moonshot/moonshot-v1-128k';

UPDATE model_registry
SET import_regex = '^(?:(?:zhipu|z-ai)/)?glm-?4\.6(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'zhipu/glm-4.6';

UPDATE model_registry
SET import_regex = '^(?:(?:zhipu|z-ai)/)?glm-?4\.7(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'zhipu/glm-4.7';

UPDATE model_registry
SET import_regex = '^(?:(?:zhipu|z-ai)/)?glm-?5(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'zhipu/glm-5';

UPDATE model_registry
SET import_regex = '^(?:(?:zhipu|z-ai)/)?glm-?5\.1(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'zhipu/glm-5.1';

UPDATE model_registry
SET import_regex = '^(?:(?:minimax|minimaxai)/)?minimax-m2(?:[-:][\w-]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'minimax/minimax-m2';

UPDATE model_registry
SET import_regex = '^(?:(?:minimax|minimaxai)/)?minimax-m2\.1(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'minimax/minimax-m2.1';

UPDATE model_registry
SET import_regex = '^(?:(?:minimax|minimaxai)/)?minimax-m2\.5(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'minimax/minimax-m2.5';

UPDATE model_registry
SET import_regex = '^(?:(?:minimax|minimaxai)/)?minimax-m2\.7(?:[-:][\w.]+)*$', updated_at = CURRENT_TIMESTAMP
WHERE canonical_model = 'minimax/minimax-m2.7';

INSERT INTO model_aliases (alias, provider_hint, canonical_model, created_at, updated_at)
VALUES
  ('openai/gpt-5-codex-mini', '', 'openai/gpt-5-codex-mini', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('openai/gpt-5.3-codex', '', 'openai/gpt-5.3-codex', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-235b-a22b', '', 'alibaba/qwen3-235b-a22b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-coder-480b-a35b', '', 'alibaba/qwen3-coder-480b-a35b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3-vl-plus', '', 'alibaba/qwen3-vl-plus', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3.5-122b-a10b', '', 'alibaba/qwen3.5-122b-a10b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwen3.5-plus', '', 'alibaba/qwen3.5-plus', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('alibaba/qwq-32b', '', 'alibaba/qwq-32b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('minimax/minimax-m2', '', 'minimax/minimax-m2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(alias, provider_hint) DO NOTHING;
