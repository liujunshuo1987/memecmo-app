-- Fix: the v0.5 workspace tables were granted to `authenticated`/`anon` only.
-- The Inngest background worker (lib/inngest/functions.ts → svc()) connects as
-- the Supabase `service_role`, which was never granted table privileges.
--
-- service_role has BYPASSRLS, so RLS policies don't block it — but Postgres
-- table-level GRANTs still apply. Without these grants the worker hits
-- "permission denied for table projects/agent_runs/…" on its very first query
-- (load-project), and every agent run dies before doing any work.
--
-- Normally Supabase auto-grants service_role via default privileges, but these
-- tables were created by the pooler `postgres.<ref>` role whose default
-- privileges didn't include service_role — hence the gap.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_runs           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_run_events     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages        TO service_role;

-- Helper functions (used by RLS, but harmless to expose to the bypass role too)
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID)      TO service_role;
GRANT EXECUTE ON FUNCTION public.is_project_visible(UUID) TO service_role;

-- Any sequences in public (none today — all PKs are UUID — but future-proof)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Future tables/functions/sequences created by postgres in public also grant
-- to service_role automatically, so we never reopen this hole.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
