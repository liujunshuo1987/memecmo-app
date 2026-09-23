-- Intervention → outcome telemetry (data class 4 in our own data-rights draft,
-- never collected until now).
--
-- Every scan records what engines SAY; nothing recorded what the client DID.
-- Without the action side there is no causal evidence — "a brandsvietnam
-- feature moved Perplexity within two weeks" can only be known if the feature's
-- publish date and URL exist as data. One row per real-world action the
-- engines can read: a page published, schema deployed, a directory profile
-- claimed, a third-party placement, an encyclopedia entry, a site update.
-- Outcomes are NOT stored here — they are computed from the scans on either
-- side of published_at (lib/interventions.ts), so they stay true as scans
-- accumulate.
CREATE TABLE IF NOT EXISTS public.interventions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('content_page','schema','third_party_placement','encyclopedia','directory_profile','site_update','other')),
  url               TEXT,
  domain            TEXT,                      -- derived from url; joins to citation data
  title             TEXT,
  note              TEXT,
  target_prompts    JSONB NOT NULL DEFAULT '[]', -- [{hash, prompt}] the action aims at
  source_asset_type TEXT,                      -- deliverable it came from, if any
  source_run_id     UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  published_at      DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live','removed')),
  logged_by         UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interventions_project_idx ON public.interventions (project_id, published_at DESC);
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interventions TO service_role;
