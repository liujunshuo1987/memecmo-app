-- Verification ground truth, asked the right way round.
--
-- 20260903e returned every distinct domain for a project so the gate could hold
-- an allowlist in memory. FMVN's index already exceeds PostgREST's 1000-row
-- reply cap, so that list came back TRUNCATED — and a truncated allowlist in a
-- verification gate does not fail safe: a real domain past the cut looks
-- hallucinated and its (correct) claim gets dropped from the client's report.
--
-- Invert it. The report mentions a handful of domains; ask which of THOSE are
-- known. Bounded by the claim text, not by the size of the index.
DROP FUNCTION IF EXISTS public.geo_project_domains(UUID);

CREATE OR REPLACE FUNCTION public.geo_domains_known(
  p_project_id UUID,
  p_domains    TEXT[]
)
RETURNS TABLE (domain TEXT, cites BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT g.domain, count(*)
    FROM public.geo_citations g
   WHERE g.project_id = p_project_id
     AND g.domain = ANY (p_domains)
   GROUP BY g.domain;
$$;

GRANT EXECUTE ON FUNCTION public.geo_domains_known(UUID, TEXT[]) TO authenticated, service_role;
