-- Source-Authority Index — proprietary GEO data layer.
--
-- Every Monitor scan records the citation URLs the AI engines returned. Stored
-- denormalized (one row per observed citation) so we can aggregate, across all
-- scans of a project over time, which DOMAINS the engines actually cite for
-- this brand/market. That ranking is the GEO-native authority signal (the AEO
-- targeting list) — derived from real AI behavior, not a backlink graph. It
-- compounds: the more scans, the richer the index.

CREATE TABLE IF NOT EXISTS public.geo_citations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_run_id    UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  engine          TEXT NOT NULL,            -- 'ChatGPT' | 'Perplexity' | ...
  stage           TEXT,                     -- funnel stage of the prompt
  domain          TEXT NOT NULL,            -- normalized hostname (no www)
  url             TEXT NOT NULL,
  is_brand_domain BOOLEAN NOT NULL DEFAULT false,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_geocite_project_domain ON public.geo_citations(project_id, domain);
CREATE INDEX IF NOT EXISTS idx_geocite_project_ts     ON public.geo_citations(project_id, ts);

ALTER TABLE public.geo_citations ENABLE ROW LEVEL SECURITY;

-- Read access follows project visibility. Writes are done by the Monitor worker
-- (service_role, which bypasses RLS) — so no INSERT policy for authenticated.
DROP POLICY IF EXISTS geo_citations_select ON public.geo_citations;
CREATE POLICY geo_citations_select ON public.geo_citations
  FOR SELECT TO authenticated
  USING (public.is_project_visible(project_id));

-- Base-table grants (RLS still filters rows for authenticated).
GRANT SELECT ON public.geo_citations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_citations TO service_role;
