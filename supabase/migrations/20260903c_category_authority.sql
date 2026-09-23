-- Category Authority Index (S2).
--
-- S1 asked "does the brand appear when this domain is cited?" — a two-brand
-- question. S2 asks the category question: how central is this domain to the
-- WHOLE competitive set, and who is standing on it?
--
-- The pooling axis is BRANDS, not customers. Every scan already observes the
-- client plus its named competitors (FMVN's index carries 13 brands), so a
-- category ranking is computable from one customer's own data — no
-- cross-customer pooling, no minimum-customer threshold, no dependency on the
-- data-rights rollout. Cross-customer pooling later only adds robustness.
--
-- Four raw components per domain, returned unscaled so the score built on top
-- stays auditable and tunable in app code:
--   brand_reach   — distinct category brands appearing in answers citing it
--   prompt_reach  — distinct questions it is cited on
--   intent_weight — share of its citations on high-intent questions
--   engine_spread — how many engines reach for it
-- plus the client's own standing on that domain.

CREATE OR REPLACE FUNCTION public.geo_category_authority(
  p_project_id UUID,
  p_min_cites  INT DEFAULT 4
)
RETURNS TABLE (
  domain           TEXT,
  brands           BIGINT,   -- distinct category brands seen alongside it
  prompts          BIGINT,   -- distinct questions citing it
  cites            BIGINT,
  hi_cites         BIGINT,
  engines          BIGINT,
  client_win_cites BIGINT,   -- citations where the CLIENT was in the answer
  client_prompts   BIGINT,
  holders          TEXT[],   -- competitor brands most often standing there
  tot_brands       BIGINT,   -- cell totals, for normalisation
  tot_prompts      BIGINT,
  tot_engines      BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT domain, engine, intent, prompt_hash, brand_present, competitors
      FROM public.geo_citations
     WHERE project_id = p_project_id
       AND brand_present IS NOT NULL
       AND is_brand_domain = false
  ),
  -- One row per (domain, brand) observation. The client counts as a brand on
  -- the domains where it actually appeared.
  brand_obs AS (
    SELECT b.domain, comp AS brand
      FROM base b CROSS JOIN LATERAL unnest(b.competitors) AS comp
    UNION
    SELECT b.domain, '__client__' FROM base b WHERE b.brand_present
  ),
  per_domain AS (
    SELECT
      b.domain,
      count(*)                                                   AS cites,
      count(DISTINCT b.prompt_hash)                              AS prompts,
      count(*) FILTER (WHERE b.intent = 'high_intent')           AS hi_cites,
      count(DISTINCT b.engine)                                   AS engines,
      count(*) FILTER (WHERE b.brand_present)                    AS client_win_cites,
      count(DISTINCT b.prompt_hash) FILTER (WHERE b.brand_present) AS client_prompts
    FROM base b GROUP BY b.domain
  ),
  brands_per_domain AS (
    SELECT domain, count(DISTINCT brand) AS brands FROM brand_obs GROUP BY domain
  ),
  holders AS (
    SELECT h.domain, array_agg(h.brand ORDER BY h.n DESC, h.brand) AS holders
      FROM (
        SELECT b.domain, comp AS brand, count(*) AS n
          FROM base b CROSS JOIN LATERAL unnest(b.competitors) AS comp
         GROUP BY b.domain, comp
      ) h GROUP BY h.domain
  ),
  totals AS (
    SELECT (SELECT count(DISTINCT brand) FROM brand_obs)   AS tot_brands,
           (SELECT count(DISTINCT prompt_hash) FROM base)  AS tot_prompts,
           (SELECT count(DISTINCT engine) FROM base)       AS tot_engines
  )
  SELECT d.domain, COALESCE(bp.brands, 0), d.prompts, d.cites, d.hi_cites, d.engines,
         d.client_win_cites, d.client_prompts,
         COALESCE(h.holders, '{}'), t.tot_brands, t.tot_prompts, t.tot_engines
    FROM per_domain d
    LEFT JOIN brands_per_domain bp ON bp.domain = d.domain
    LEFT JOIN holders h            ON h.domain  = d.domain
    CROSS JOIN totals t
   WHERE d.cites >= p_min_cites
   ORDER BY COALESCE(bp.brands, 0) DESC, d.prompts DESC
   LIMIT 400;
$$;

GRANT EXECUTE ON FUNCTION public.geo_category_authority(UUID, INT) TO authenticated, service_role;
