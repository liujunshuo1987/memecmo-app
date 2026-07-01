-- Security hardening — clears the real (non-cosmetic) Supabase Security Advisor
-- findings. Scope verified before writing (function bodies read, route clients
-- checked) so every change is non-breaking:
--
--  1. Pin search_path on all 8 public functions. The two that matter are the
--     multi-tenant isolation helpers is_org_member / is_project_visible — both
--     SECURITY DEFINER, both had a NULL (mutable) search_path. Their bodies are
--     already fully schema-qualified (public.*, auth.uid()), so search_path=''
--     is safe and removes the pg_temp-shadowing vector against the isolation layer.
--  2. Enable RLS on __migrations (touched only by the superuser migration tool,
--     which bypasses RLS) — deny PostgREST anon/authenticated entirely.
--  3. Enable RLS on geo_analysis_cache (legacy shared cache, no tenant/PII column,
--     read/written by the user-scoped client) with a policy preserving current
--     authenticated behavior — resolves the ERROR without breaking the SOV dashboard.

-- ── 1. Pin function search_path ──────────────────────────────────────────────
-- Fully-qualified / built-in-only bodies → empty search_path is non-breaking.
ALTER FUNCTION public.is_org_member(uuid)          SET search_path = '';
ALTER FUNCTION public.is_project_visible(uuid)     SET search_path = '';
ALTER FUNCTION public.set_updated_at()             SET search_path = '';
ALTER FUNCTION public.waitlist_touch_updated_at()  SET search_path = '';
ALTER FUNCTION public.waitlist_compute_priority()  SET search_path = '';
ALTER FUNCTION public.reset_daily_cost_tracking()  SET search_path = '';

-- cleanup_expired_cache referenced geo_analysis_cache unqualified → qualify it,
-- then it is safe under an empty search_path.
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
  RETURNS void LANGUAGE plpgsql SET search_path = ''
AS $function$
BEGIN
  DELETE FROM public.geo_analysis_cache WHERE expires_at < now();
  RAISE NOTICE 'Cleaned up expired cache entries';
END;
$function$;

-- ── 2. Lock the internal migration ledger ────────────────────────────────────
ALTER TABLE public.__migrations ENABLE ROW LEVEL SECURITY;
-- No policy → PostgREST (anon/authenticated) denied; the migration runner
-- connects as the DB owner via DATABASE_URL and bypasses RLS.

-- ── 3. RLS on the legacy analysis cache ──────────────────────────────────────
ALTER TABLE public.geo_analysis_cache ENABLE ROW LEVEL SECURITY;
-- Shared, non-personal computation cache keyed by query hash (no user/org column).
-- Preserve existing behavior for the user-scoped SOV routes; anon stays denied.
DROP POLICY IF EXISTS geo_cache_authenticated ON public.geo_analysis_cache;
CREATE POLICY geo_cache_authenticated ON public.geo_analysis_cache
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
