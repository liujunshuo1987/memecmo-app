-- Cited-page fetcher, phase 2 (founder go-ahead 2026-09-23):
--   1. what gets cited here — page features by engine and citation intensity
--   2. verified actions — an intervention's page is fetched, hashed, re-checked
--   3. the client's own site corpus — sitemap-discovered pages read into geo_pages
-- All aggregation in SQL, bounded by project (never page an index into memory).

-- 1. Intervention verification
ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS page_ok      BOOLEAN,
  ADD COLUMN IF NOT EXISTS page_status  INT,
  ADD COLUMN IF NOT EXISTS page_title   TEXT,
  ADD COLUMN IF NOT EXISTS page_words   INT,
  ADD COLUMN IF NOT EXISTS text_hash    TEXT,
  ADD COLUMN IF NOT EXISTS changed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verify_error TEXT;

-- 2. The client's own pages (discovered from its sitemap); content lives in geo_pages
CREATE TABLE IF NOT EXISTS public.project_pages (
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'sitemap',
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, url)
);
ALTER TABLE public.project_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_pages_select ON public.project_pages;
CREATE POLICY project_pages_select ON public.project_pages FOR SELECT TO authenticated USING (public.is_project_visible(project_id));
GRANT SELECT ON public.project_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_pages TO service_role;

-- 3. Queue = cited urls ∪ the client's own pages
CREATE OR REPLACE FUNCTION public.geo_pages_due(p_project_id UUID, p_limit INT DEFAULT 100)
RETURNS TABLE (url TEXT, domain TEXT, cites BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH wanted AS (
    SELECT c.url, c.domain, count(*)::bigint AS cites
      FROM public.geo_citations c
     WHERE (p_project_id IS NULL OR c.project_id = p_project_id)
     GROUP BY c.url, c.domain
    UNION ALL
    SELECT s.url, split_part(regexp_replace(lower(s.url), '^https?://(www\.)?', ''), '/', 1), 2::bigint
      FROM public.project_pages s
     WHERE (p_project_id IS NULL OR s.project_id = p_project_id)
  ), agg AS (SELECT w.url, max(w.domain) AS domain, sum(w.cites) AS cites FROM wanted w GROUP BY w.url)
  SELECT a.url, a.domain, a.cites
    FROM agg a LEFT JOIN public.geo_pages p ON p.url = a.url
   WHERE p.id IS NULL OR (p.next_fetch_at <= now() AND p.attempts < 4)
   ORDER BY a.cites DESC
   LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.geo_pages_due(UUID, INT) TO service_role;

-- 4. What the engines cite here. bucket: all | heavy (cited ≥3 times) | light (once/twice)
CREATE OR REPLACE FUNCTION public.geo_citation_profile(p_project_id UUID)
RETURNS TABLE (engine TEXT, bucket TEXT, pages BIGINT, schema_share NUMERIC, faq_share NUMERIC, dated_share NUMERIC,
               recent_share NUMERIC, brand_share NUMERIC, median_words NUMERIC, median_age_days NUMERIC, top_schema_types TEXT[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH cited AS (
    SELECT c.engine, c.url, count(*) AS cites, bool_or(c.is_brand_domain) AS is_brand
      FROM public.geo_citations c WHERE c.project_id = p_project_id GROUP BY c.engine, c.url
  ), j AS (
    SELECT cited.engine, cited.cites, cited.is_brand,
           (cardinality(p.schema_types) > 0) AS has_schema, p.has_faq, p.schema_types,
           coalesce(p.modified_at, p.published_at) AS dated, p.word_count
      FROM cited JOIN public.geo_pages p ON p.url = cited.url WHERE p.ok
  ), b AS (
    SELECT j.*, 'all'::text AS bucket FROM j
    UNION ALL
    SELECT j.*, CASE WHEN j.cites >= 3 THEN 'heavy' ELSE 'light' END FROM j
  )
  SELECT b.engine, b.bucket, count(*)::bigint AS pages,
         round(avg(b.has_schema::int), 3),
         round(avg(b.has_faq::int), 3),
         round(avg((b.dated IS NOT NULL)::int), 3),
         round(avg((b.dated IS NOT NULL AND b.dated >= now() - interval '180 days')::int), 3),
         round(avg(b.is_brand::int), 3),
         percentile_cont(0.5) WITHIN GROUP (ORDER BY b.word_count),
         percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (now() - b.dated)) / 86400),
         (SELECT array_agg(t.ty ORDER BY t.n DESC) FROM (
             SELECT x.ty, count(*) AS n FROM b b2, unnest(b2.schema_types) AS x(ty)
              WHERE b2.engine = b.engine AND b2.bucket = b.bucket GROUP BY x.ty ORDER BY n DESC LIMIT 5) t)
    FROM b
   GROUP BY b.engine, b.bucket;
$$;
GRANT EXECUTE ON FUNCTION public.geo_citation_profile(UUID) TO authenticated, service_role;

-- 5. Was this exact url cited after a date? (intervention → cited, by domain index first)
CREATE OR REPLACE FUNCTION public.geo_url_cites(p_project_id UUID, p_domain TEXT, p_url TEXT, p_after TIMESTAMPTZ)
RETURNS TABLE (cites BIGINT, engines BIGINT, first_ts TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT count(*)::bigint, count(DISTINCT c.engine)::bigint, min(c.ts)
    FROM public.geo_citations c
   WHERE c.project_id = p_project_id AND c.domain = p_domain AND c.ts >= p_after
     AND rtrim(lower(regexp_replace(c.url, '^https?://(www\.)?', '')), '/') = rtrim(lower(regexp_replace(p_url, '^https?://(www\.)?', '')), '/');
$$;
GRANT EXECUTE ON FUNCTION public.geo_url_cites(UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated, service_role;
