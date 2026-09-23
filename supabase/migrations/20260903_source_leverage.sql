-- Source Leverage (S1) — the corpus-leverage layer on the citation index.
--
-- The citation index (20260626c) records WHICH domains the engines cite. S1
-- adds the outcome each citation co-occurred with: was the brand actually IN
-- that answer, and if not, which competitors were? Aggregated per domain this
-- separates two very different kinds of source:
--
--   win-skewed  → the source's content carries the brand; when an engine
--                 reaches for it, the brand surfaces. Defend and extend.
--   loss-only   → the engines treat it as a category authority, it names
--                 competitors, and the brand appears in NONE of it. That is a
--                 pure citation gap — the highest-yield acquisition target.
--
-- The S1 columns were added live during the 2026-09-02 backfill; declared here
-- idempotently so the schema is reproducible from migrations alone.

ALTER TABLE public.geo_citations
  ADD COLUMN IF NOT EXISTS intent        TEXT,
  ADD COLUMN IF NOT EXISTS prompt_hash   TEXT,
  ADD COLUMN IF NOT EXISTS brand_present BOOLEAN,
  ADD COLUMN IF NOT EXISTS competitors   TEXT[];

CREATE INDEX IF NOT EXISTS geo_citations_intent_idx ON public.geo_citations(project_id, intent);
CREATE INDEX IF NOT EXISTS geo_citations_prompt_idx ON public.geo_citations(project_id, prompt_hash);
-- Drives the leverage aggregation below (third-party rows with a verdict).
CREATE INDEX IF NOT EXISTS geo_citations_leverage_idx
  ON public.geo_citations(project_id, domain)
  WHERE brand_present IS NOT NULL AND is_brand_domain = false;

-- Per-domain leverage for one project, over the whole index (it compounds —
-- that is the asset). Ranking/thresholds stay in application code so they can
-- be tuned without a migration. SECURITY INVOKER: RLS on geo_citations still
-- decides which projects a caller can aggregate.
CREATE OR REPLACE FUNCTION public.geo_source_leverage(p_project_id UUID)
RETURNS TABLE (
  domain          TEXT,
  win_cites       BIGINT,
  loss_cites      BIGINT,
  win_prompts     BIGINT,
  loss_prompts    BIGINT,
  hi_win          BIGINT,
  hi_loss         BIGINT,
  engines         BIGINT,
  win_engines     BIGINT,
  first_seen      TIMESTAMPTZ,
  last_seen       TIMESTAMPTZ,
  top_competitors TEXT[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT domain, engine, intent, prompt_hash, brand_present, competitors, ts
      FROM public.geo_citations
     WHERE project_id = p_project_id
       AND brand_present IS NOT NULL
       AND is_brand_domain = false
  ),
  agg AS (
    SELECT
      b.domain,
      count(*) FILTER (WHERE b.brand_present)                                  AS win_cites,
      count(*) FILTER (WHERE NOT b.brand_present)                              AS loss_cites,
      count(DISTINCT b.prompt_hash) FILTER (WHERE b.brand_present)             AS win_prompts,
      count(DISTINCT b.prompt_hash) FILTER (WHERE NOT b.brand_present)         AS loss_prompts,
      count(*) FILTER (WHERE b.brand_present AND b.intent = 'high_intent')     AS hi_win,
      count(*) FILTER (WHERE NOT b.brand_present AND b.intent = 'high_intent') AS hi_loss,
      count(DISTINCT b.engine)                                                 AS engines,
      count(DISTINCT b.engine) FILTER (WHERE b.brand_present)                  AS win_engines,
      min(b.ts)                                                                AS first_seen,
      max(b.ts)                                                                AS last_seen
    FROM base b
    GROUP BY b.domain
  ),
  comps AS (
    SELECT c.domain, array_agg(c.competitor ORDER BY c.n DESC, c.competitor) AS top_competitors
    FROM (
      SELECT b.domain, comp AS competitor, count(*) AS n
        FROM base b
        CROSS JOIN LATERAL unnest(b.competitors) AS comp
       WHERE NOT b.brand_present
       GROUP BY b.domain, comp
    ) c
    GROUP BY c.domain
  )
  SELECT a.domain, a.win_cites, a.loss_cites, a.win_prompts, a.loss_prompts,
         a.hi_win, a.hi_loss, a.engines, a.win_engines, a.first_seen, a.last_seen,
         COALESCE(k.top_competitors, '{}')
    FROM agg a
    LEFT JOIN comps k ON k.domain = a.domain;
$$;

GRANT EXECUTE ON FUNCTION public.geo_source_leverage(UUID) TO authenticated, service_role;
