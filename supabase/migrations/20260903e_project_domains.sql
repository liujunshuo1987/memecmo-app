-- Ground truth for the report verification gate.
--
-- The interpretation model writes prose tagged [Observed]. Nothing checked
-- those tags, so a hallucinated source domain or invented engine name would
-- ship to the client wearing an evidence label — exactly the "unverified
-- judgements in the report" failure a partner audit called out on 2026-09-03.
-- The gate needs the set of domains this project has ACTUALLY seen cited;
-- anything outside it, asserted as observed, is not an observation.
CREATE OR REPLACE FUNCTION public.geo_project_domains(p_project_id UUID)
RETURNS TABLE (domain TEXT, is_brand BOOLEAN, cites BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT domain, bool_or(is_brand_domain), count(*)
    FROM public.geo_citations
   WHERE project_id = p_project_id
   GROUP BY domain;
$$;

GRANT EXECUTE ON FUNCTION public.geo_project_domains(UUID) TO authenticated, service_role;
