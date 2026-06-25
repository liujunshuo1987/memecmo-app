-- Fix: the v0.5 workspace tables had RLS policies but no base-table GRANTs.
-- In Postgres/Supabase, RLS only filters rows AFTER the role passes the
-- table-level privilege check. Without GRANT, the `authenticated` role gets
-- "permission denied for table …" — which the Supabase JS client surfaces as
-- an empty result, making every workspace query look like "not found".
--
-- Grant the standard Supabase privileges to authenticated (and anon where
-- a public read is intended). RLS policies still gate which ROWS are visible.

GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- authenticated: full CRUD, gated by RLS policies
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_runs           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_run_events     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages        TO authenticated;

-- RLS helper functions must be executable by the authenticated role
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID)      TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_project_visible(UUID) TO authenticated, anon;

-- Make future-proof: any new table/function created later by postgres in
-- public also gets these grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, anon;
