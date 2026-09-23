-- Source leverage, ranked in SQL.
--
-- The first cut returned one row per third-party domain and let the app rank
-- them. FMVN's index already holds >1000 such domains, so PostgREST's 1000-row
-- cap silently truncated the aggregate mid-list — qualifying sources could be
-- dropped from a client email with no error anywhere. Thresholds are therefore
-- parameters (still tunable from app code, no migration to change them) and the
-- function returns only the two ranked short-lists plus honest totals.
--
-- Signature change ⇒ drop first: an overload with all-default extras would make
-- geo_source_leverage(uuid) ambiguous.
DROP FUNCTION IF EXISTS public.geo_source_leverage(UUID);

CREATE OR REPLACE FUNCTION public.geo_source_leverage(
  p_project_id          UUID,
  p_brand_domains       TEXT[] DEFAULT '{}',
  p_carrier_min_prompts INT    DEFAULT 3,
  p_carrier_min_engines INT    DEFAULT 2,
  p_carrier_min_ratio   INT    DEFAULT 3,
  p_gap_min_prompts     INT    DEFAULT 2,
  p_gap_min_high_intent INT    DEFAULT 5,
  p_limit               INT    DEFAULT 5
)
RETURNS TABLE (
  kind            TEXT,        -- 'carrier' | 'gap'
  domain          TEXT,
  win_cites       BIGINT,
  loss_cites      BIGINT,
  win_prompts     BIGINT,
  loss_prompts    BIGINT,
  hi_win          BIGINT,
  hi_loss         BIGINT,
  engines         BIGINT,
  top_competitors TEXT[],
  total_domains   BIGINT,      -- every third-party domain with a verdict
  total_cites     BIGINT,      -- citation rows behind the analysis
  since           TIMESTAMPTZ  -- start of the observation window
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
       AND NOT (domain = ANY (p_brand_domains))
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
      count(DISTINCT b.engine) FILTER (WHERE b.brand_present)                  AS win_engines
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
  ),
  totals AS (
    SELECT count(*) AS total_domains,
           COALESCE(sum(a.win_cites + a.loss_cites), 0) AS total_cites,
           (SELECT min(ts) FROM base) AS since
      FROM agg a
  ),
  -- Sources whose content the brand appears alongside: held across enough
  -- DISTINCT questions and enough engines that one lucky sample cannot create
  -- the pattern, and outscoring their misses by the required multiple.
  carriers AS (
    SELECT 'carrier'::TEXT AS kind, a.*
      FROM agg a
     WHERE a.win_prompts >= p_carrier_min_prompts
       AND a.win_engines >= p_carrier_min_engines
       AND a.win_cites   >= p_carrier_min_ratio * (a.loss_cites + 1)
     ORDER BY a.win_prompts DESC, a.win_cites DESC
     LIMIT p_limit
  ),
  -- Category authorities the brand is absent from entirely, while named
  -- competitors stand there on high-intent questions.
  gaps AS (
    SELECT 'gap'::TEXT AS kind, a.*
      FROM agg a
     WHERE a.win_cites    = 0
       AND a.loss_prompts >= p_gap_min_prompts
       AND a.hi_loss      >= p_gap_min_high_intent
       AND EXISTS (SELECT 1 FROM comps k WHERE k.domain = a.domain)
     ORDER BY a.hi_loss DESC, a.loss_cites DESC
     LIMIT p_limit
  ),
  picked AS (SELECT * FROM carriers UNION ALL SELECT * FROM gaps)
  SELECT p.kind, p.domain, p.win_cites, p.loss_cites, p.win_prompts, p.loss_prompts,
         p.hi_win, p.hi_loss, p.engines,
         COALESCE(k.top_competitors, '{}'),
         t.total_domains, t.total_cites, t.since
    FROM picked p
    CROSS JOIN totals t
    LEFT JOIN comps k ON k.domain = p.domain
   ORDER BY p.kind, p.win_prompts DESC, p.hi_loss DESC;
$$;

GRANT EXECUTE ON FUNCTION public.geo_source_leverage(UUID, TEXT[], INT, INT, INT, INT, INT, INT)
  TO authenticated, service_role;
