-- Cited-page fetcher (founder go-ahead 2026-09-23): what is ON the pages the
-- engines cite. geo_citations knows WHICH urls each engine cited per prompt;
-- this table records the page's features so "what gets cited" becomes a
-- dataset that compounds with every scan (data class ③ — ours).
--
-- Features, not copies: title/dates/schema/structure/outbound domains and a
-- short excerpt are served to the workspace; the full text is stored for
-- internal analysis only and is NOT granted to authenticated users
-- (column-level grant below). robots.txt is honoured (blocked_by_robots).
CREATE TABLE IF NOT EXISTS public.geo_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url               TEXT NOT NULL UNIQUE,          -- exactly as cited (joins geo_citations.url)
  domain            TEXT NOT NULL,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  fetched_at        TIMESTAMPTZ,
  next_fetch_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts          INT NOT NULL DEFAULT 0,
  ok                BOOLEAN,
  status            INT,
  error             TEXT,
  blocked_by_robots BOOLEAN NOT NULL DEFAULT false,
  final_url         TEXT,
  content_type      TEXT,
  title             TEXT,
  lang              TEXT,
  published_at      TIMESTAMPTZ,
  modified_at       TIMESTAMPTZ,
  author            TEXT,
  canonical         TEXT,
  word_count        INT,
  headings_count    INT,
  has_faq           BOOLEAN NOT NULL DEFAULT false,
  schema_types      TEXT[] NOT NULL DEFAULT '{}',
  outbound_domains  TEXT[] NOT NULL DEFAULT '{}',
  excerpt           TEXT,
  text_hash         TEXT,
  text              TEXT,                          -- private
  fetch_ms          INT
);
CREATE INDEX IF NOT EXISTS idx_geo_pages_domain ON public.geo_pages(domain);
CREATE INDEX IF NOT EXISTS idx_geo_pages_next   ON public.geo_pages(next_fetch_at);

ALTER TABLE public.geo_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geo_pages_select ON public.geo_pages;
CREATE POLICY geo_pages_select ON public.geo_pages FOR SELECT TO authenticated USING (true);
-- Every column except the stored text.
GRANT SELECT (id, url, domain, first_seen_at, fetched_at, next_fetch_at, attempts, ok, status, error, blocked_by_robots,
              final_url, content_type, title, lang, published_at, modified_at, author, canonical, word_count,
              headings_count, has_faq, schema_types, outbound_domains, excerpt, text_hash, fetch_ms)
  ON public.geo_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_pages TO service_role;

-- Fetch queue: cited urls with no page row, or due for a re-fetch. Most-cited first.
CREATE OR REPLACE FUNCTION public.geo_pages_due(p_project_id UUID, p_limit INT DEFAULT 100)
RETURNS TABLE (url TEXT, domain TEXT, cites BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c.url, c.domain, count(*) AS cites
    FROM public.geo_citations c
    LEFT JOIN public.geo_pages p ON p.url = c.url
   WHERE (p_project_id IS NULL OR c.project_id = p_project_id)
     AND (p.id IS NULL OR (p.next_fetch_at <= now() AND p.attempts < 4))
   GROUP BY c.url, c.domain
   ORDER BY count(*) DESC
   LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.geo_pages_due(UUID, INT) TO service_role;

-- Per-domain page features for one project's cited domains, aggregated in SQL
-- (never page an index into memory — see 20260923_citation_ranking).
CREATE OR REPLACE FUNCTION public.geo_domain_pages(p_project_id UUID)
RETURNS TABLE (domain TEXT, pages BIGINT, fetched BIGINT, schema_pages BIGINT, faq_pages BIGINT, dated_pages BIGINT,
               last_modified TIMESTAMPTZ, avg_words INT, blocked BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH urls AS (SELECT DISTINCT c.domain, c.url FROM public.geo_citations c WHERE c.project_id = p_project_id)
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
   GROUP BY u.domain;
$$;
GRANT EXECUTE ON FUNCTION public.geo_domain_pages(UUID) TO authenticated, service_role;
