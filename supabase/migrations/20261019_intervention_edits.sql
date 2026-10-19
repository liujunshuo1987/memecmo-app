-- Changes to a logged action: who made each one, when, and what it replaced.
-- Decided by the founder on 2026-10-19 (option A: one row per change, old values kept).
--
-- A logged action (interventions) is the client's record. Its publish date
-- splits the before/after outcome; the scorecard and the digest count who
-- logged it, the date and the target question. So an action can be edited or
-- removed only where the change is kept with its author and the values it
-- replaced (lib/interventions recordEdit, app/api/workspace/interventions):
--   PATCH  writes one 'edit' row here BEFORE changing the action, and refuses
--          while this table does not exist;
--   DELETE writes one 'remove' row ({ status: { from: 'live', to: 'removed' } });
--   GET    shows "Edited <date> by <who>" from the latest 'edit' row.
-- The panel offers Edit / Remove only once this table answers. Nothing that
-- computes an outcome reads it.

CREATE TABLE IF NOT EXISTS public.intervention_edits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id  UUID NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action           TEXT NOT NULL CHECK (action IN ('edit', 'remove')),
  changes          JSONB NOT NULL DEFAULT '{}',   -- { field: { from, to } }
  edited_by        UUID,                          -- auth user id (as interventions.logged_by)
  channel          TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'lark', 'connector')),
  edited_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intervention_edits_iv_idx ON public.intervention_edits (intervention_id, edited_at DESC);
CREATE INDEX IF NOT EXISTS intervention_edits_project_idx ON public.intervention_edits (project_id, edited_at DESC);

-- Service role only, like interventions: the API authorises, then uses the service client.
ALTER TABLE public.intervention_edits ENABLE ROW LEVEL SECURITY;
-- DELETE only so the route can take back a record whose change then failed to land.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intervention_edits TO service_role;
