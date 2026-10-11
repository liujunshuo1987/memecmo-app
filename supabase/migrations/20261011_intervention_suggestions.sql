-- Suggested actions (lib/suggestions.ts). On 2026-10-11 FMVN had 0 logged
-- actions although its FAQ page had been live for weeks and was cited in the
-- scans: the platform reads the client's site and still asked a person to type
-- a link and a date. A page found by site-discover, the fetcher or the citation
-- index is stored here as a SUGGESTION; it becomes an intervention only when a
-- person confirms it, and that intervention is signed with their account.
-- A row here is never counted as an action (digest, collaboration alignment).
CREATE TABLE IF NOT EXISTS public.intervention_suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq               INT  NOT NULL,                 -- per project, never reused: the number people quote ("/xacnhan 3")
  url               TEXT NOT NULL,                 -- where the page lives (what people open; becomes interventions.url)
  url_key           TEXT NOT NULL,                 -- normalised address (normUrl): one suggestion per page
  domain            TEXT,
  title             TEXT,
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_guess   DATE NOT NULL,                 -- a guess; the person confirming can correct it
  guess_source      TEXT NOT NULL CHECK (guess_source IN ('sitemap_lastmod','page_meta','first_seen')),
  target_candidates JSONB NOT NULL DEFAULT '[]',   -- [{n, prompt, shared, strong}] ≤3 of the fixed questions, by word overlap with the title
  evidence          JSONB NOT NULL DEFAULT '{}',   -- {firstSeenAt, discoveredAt, firstCitedAt, cites, engines, words, aliases}
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','dismissed')),
  confirmed_by      UUID,
  confirmed_at      TIMESTAMPTZ,
  dismissed_by      UUID,
  dismissed_at      TIMESTAMPTZ,
  intervention_id   UUID REFERENCES public.interventions(id) ON DELETE SET NULL,
  channel           TEXT CHECK (channel IN ('web','lark')),   -- where it was confirmed
  lark_posted_at    TIMESTAMPTZ,                   -- last time it was listed in the project's Lark group
  lark_posted_by    TEXT,                          -- who approved that post
  UNIQUE (project_id, url_key),
  UNIQUE (project_id, seq)
);
CREATE INDEX IF NOT EXISTS intervention_suggestions_pending_idx ON public.intervention_suggestions (project_id, status);

-- Service role only, like interventions: the API authorises, then uses the service client.
ALTER TABLE public.intervention_suggestions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intervention_suggestions TO service_role;

-- Sitemap <lastmod> as first recorded by site-discover — one of the three
-- sources of the publish-date guess.
ALTER TABLE public.project_pages ADD COLUMN IF NOT EXISTS lastmod TIMESTAMPTZ;

-- The brand's own urls in one project's citation index: first citation, count,
-- engines. Aggregated here (never page an index into memory); bounded by the
-- project and its own hosts, so the result is the size of the client's site.
CREATE OR REPLACE FUNCTION public.geo_own_url_cites(p_project_id UUID, p_domains TEXT[])
RETURNS TABLE (url TEXT, first_ts TIMESTAMPTZ, last_ts TIMESTAMPTZ, cites BIGINT, engines TEXT[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c.url, min(c.ts), max(c.ts), count(*)::bigint, array_agg(DISTINCT c.engine)
    FROM public.geo_citations c
   WHERE c.project_id = p_project_id AND c.domain = ANY (p_domains)
   GROUP BY c.url
   ORDER BY c.url;
$$;
GRANT EXECUTE ON FUNCTION public.geo_own_url_cites(UUID, TEXT[]) TO service_role;
