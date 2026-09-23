-- geo_domain_pages returned one row per cited domain; FMVN has >1000 cited
-- domains, so the reply hit PostgREST's 1000-row cap within an hour of
-- shipping. Same rule as always: bound by the caller's inputs (the domains
-- the sources table shows), and when unbounded return the largest first.
DROP FUNCTION IF EXISTS public.geo_domain_pages(UUID);

CREATE OR REPLACE FUNCTION public.geo_domain_pages(p_project_id UUID, p_domains TEXT[] DEFAULT NULL, p_limit INT DEFAULT 300)
RETURNS TABLE (domain TEXT, pages BIGINT, fetched BIGINT, schema_pages BIGINT, faq_pages BIGINT, dated_pages BIGINT,
               last_modified TIMESTAMPTZ, avg_words INT, blocked BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH urls AS (
    SELECT DISTINCT c.domain, c.url FROM public.geo_citations c
     WHERE c.project_id = p_project_id AND (p_domains IS NULL OR c.domain = ANY (p_domains))
  )
  SELECT u.domain,
         count(*)                                                                        AS pages,
         count(p.id) FILTER (WHERE p.ok)                                                 AS fetched,
         count(p.id) FILTER (WHERE p.ok AND cardinality(p.schema_types) > 0)             AS schema_pages,
         count(p.id) FILTER (WHERE p.ok AND p.has_faq)                                   AS faq_pages,
         count(p.id) FILTER (WHERE p.ok AND coalesce(p.modified_at, p.published_at) IS NOT NULL) AS dated_pages,
         max(coalesce(p.modified_at, p.published_at))                                    AS last_modified,
         (avg(p.word_count) FILTER (WHERE p.ok))::int                                    AS avg_words,
         count(p.id) FILTER (WHERE p.blocked_by_robots)                                  AS blocked
    FROM urls u LEFT JOIN public.geo_pages p ON p.url = u.url
   GROUP BY u.domain
   ORDER BY count(*) DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 1000);
$$;
GRANT EXECUTE ON FUNCTION public.geo_domain_pages(UUID, TEXT[], INT) TO authenticated, service_role;
