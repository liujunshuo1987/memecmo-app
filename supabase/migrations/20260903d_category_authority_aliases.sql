-- Category authority: canonicalise brand names before counting.
--
-- The engines name the same company many ways — the Vietnam OOH cell showed 36
-- distinct competitor strings for ~12 actual brands ("Goldsun" / "Goldsun
-- Media" / "Goldsun Media Group" / "Công ty Cổ phần Truyền thông và Quảng cáo
-- Goldsun" are one company). Counting raw strings inflates the denominator ~3x,
-- so a client would be shown "29 of 37 brands" when the truth is nearer
-- "10 of 12". Worse, a brand's OWN localised legal name can appear in the list
-- and be counted as a rival.
--
-- p_alias_map is {"observed string": "canonical brand"}; map a string to the
-- reserved value '__self__' to fold it into the client rather than count it as
-- a competitor. Callers build it from projects.metadata.competitorSet, which is
-- the locked, human-reviewed set.
DROP FUNCTION IF EXISTS public.geo_category_authority(UUID, INT);

CREATE OR REPLACE FUNCTION public.geo_category_authority(
  p_project_id UUID,
  p_min_cites  INT   DEFAULT 4,
  p_alias_map  JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  domain           TEXT,
  brands           BIGINT,
  prompts          BIGINT,
  cites            BIGINT,
  hi_cites         BIGINT,
  engines          BIGINT,
  client_win_cites BIGINT,
  client_prompts   BIGINT,
  holders          TEXT[],
  tot_brands       BIGINT,
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
  -- (domain, canonical brand) observations. '__self__' aliases and the client's
  -- own appearances collapse into a single client identity.
  brand_obs AS (
    SELECT DISTINCT b.domain,
           CASE WHEN COALESCE(p_alias_map ->> comp, comp) = '__self__'
                THEN '__client__' ELSE COALESCE(p_alias_map ->> comp, comp) END AS brand
      FROM base b CROSS JOIN LATERAL unnest(b.competitors) AS comp
    UNION
    SELECT b.domain, '__client__' FROM base b WHERE b.brand_present
  ),
  per_domain AS (
    SELECT b.domain,
           count(*)                                                     AS cites,
           count(DISTINCT b.prompt_hash)                                AS prompts,
           count(*) FILTER (WHERE b.intent = 'high_intent')             AS hi_cites,
           count(DISTINCT b.engine)                                     AS engines,
           count(*) FILTER (WHERE b.brand_present)                      AS client_win_cites,
           count(DISTINCT b.prompt_hash) FILTER (WHERE b.brand_present) AS client_prompts
      FROM base b GROUP BY b.domain
  ),
  brands_per_domain AS (
    SELECT domain, count(DISTINCT brand) AS brands FROM brand_obs GROUP BY domain
  ),
  holders AS (
    SELECT h.domain, array_agg(h.brand ORDER BY h.n DESC, h.brand) AS holders
      FROM (
        SELECT b.domain, COALESCE(p_alias_map ->> comp, comp) AS brand, count(*) AS n
          FROM base b CROSS JOIN LATERAL unnest(b.competitors) AS comp
         WHERE COALESCE(p_alias_map ->> comp, comp) <> '__self__'
         GROUP BY b.domain, 2
      ) h GROUP BY h.domain
  ),
  totals AS (
    SELECT (SELECT count(DISTINCT brand) FROM brand_obs)  AS tot_brands,
           (SELECT count(DISTINCT prompt_hash) FROM base) AS tot_prompts,
           (SELECT count(DISTINCT engine) FROM base)      AS tot_engines
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

GRANT EXECUTE ON FUNCTION public.geo_category_authority(UUID, INT, JSONB) TO authenticated, service_role;
