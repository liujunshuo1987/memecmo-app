-- Source-authority ranking aggregated in SQL.
--
-- run.ts built the "Sources AI cites" ranking by selecting every geo_citations
-- row for the project and counting in JS. FMVN's index passed PostgREST's
-- 1000-row reply cap long ago (see 20260903f), so the ranking and its total
-- were computed from an arbitrary 1000-row prefix: the dashboard showed a
-- domain cited 132× in ONE scan as 61× across ALL scans. Same lesson as the
-- verification gate: aggregate in SQL, never page a whole index into memory.
--
-- Two units are returned so the UI can show both honestly:
--   citations = URL citations (one answer can cite a domain several times)
--   answers   = distinct answers (run × engine × prompt) that cited the domain
--               — the unit of the measurement standard's citation metric.
CREATE OR REPLACE FUNCTION public.geo_citation_ranking(
  p_project_id UUID,
  p_limit      INT DEFAULT 20
)
RETURNS TABLE (domain TEXT, citations BIGINT, answers BIGINT, engines BIGINT, is_brand BOOLEAN)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT g.domain,
         count(*)                                                                AS citations,
         count(DISTINCT (g.agent_run_id::text || '|' || g.engine || '|' || coalesce(g.prompt_hash, ''))) AS answers,
         count(DISTINCT g.engine)                                                AS engines,
         bool_or(g.is_brand_domain)                                              AS is_brand
    FROM public.geo_citations g
   WHERE g.project_id = p_project_id
   GROUP BY g.domain
   ORDER BY count(*) DESC, g.domain
   LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.geo_citation_ranking(UUID, INT) TO authenticated, service_role;
