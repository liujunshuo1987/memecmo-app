-- User edits live apart from generated output, so a re-run can never
-- overwrite them.
--
-- Until now the only "edit" markers were meta.corrected flags set by scripts
-- on asset rows, and loaders picked the newest asset by created_at — so
-- re-running Profile or Answers silently replaced human-corrected facts with
-- a fresh generation (those two feed every other agent and the accuracy
-- judge). The in-app content editor did not persist at all.
--
-- One row per editable UNIT, keyed by a stable identity that survives
-- regeneration:
--   brand_profile     → field path           ('definition', 'facts', 'nap.phone')
--   standard_answers  → 'answer:<promptHash>:<local|en>'
--   documents         → 'doc:<agent_run_id>'  (content_draft, distribution_kit, …)
-- Readers apply edits LAST. Only the user can remove one (revert).
CREATE TABLE IF NOT EXISTS public.asset_edits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  asset_type  TEXT NOT NULL,
  unit_key    TEXT NOT NULL,
  value       JSONB NOT NULL,
  base_value  JSONB,            -- what was generated when the user edited (for "generated value has since changed" notices)
  edited_by   UUID,
  source      TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'backfill_corrected'
  edited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, asset_type, unit_key)
);
CREATE INDEX IF NOT EXISTS asset_edits_project_type_idx ON public.asset_edits (project_id, asset_type);
ALTER TABLE public.asset_edits ENABLE ROW LEVEL SECURITY;
-- All access goes through the authorised API route (service role).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_edits TO service_role;
