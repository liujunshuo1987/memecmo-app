-- Golden evaluation set — human ground truth for the scoring judge.
--
-- The judge (brandMentioned / prominence / sentiment / competitors) is ~72% of
-- scan cost and the layer we intend to distil. Any replacement must be measured
-- against human labels on the judge's REAL input distribution. Scans never
-- persisted full answer text (rawSamples keep a 400-char snippet), so nothing
-- in history can be labelled reliably; from now on every comparable scan
-- deposits its judged answers, full text and machine labels, into golden_pool.
-- Humans label BLIND (machine labels are never shown in the labelling UI).
CREATE TABLE IF NOT EXISTS public.golden_pool (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_run_id     UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  language         TEXT NOT NULL,            -- vi | zh | en …
  engine           TEXT NOT NULL,
  model            TEXT,
  stage            TEXT,
  intent           TEXT,
  key_prompt       BOOLEAN NOT NULL DEFAULT false,
  prompt           TEXT NOT NULL,
  prompt_hash      TEXT NOT NULL,
  answer_text      TEXT NOT NULL,
  brand_name       TEXT NOT NULL,
  competitor_names TEXT[] NOT NULL DEFAULT '{}',   -- tracked (scoring) set at scan time
  machine          JSONB NOT NULL,                 -- judge output at scan time {brandMentioned, prominence, sentiment, competitors, judged}
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_run_id, engine, prompt_hash)
);
CREATE INDEX IF NOT EXISTS golden_pool_lang_engine_idx ON public.golden_pool (language, engine);
ALTER TABLE public.golden_pool ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.golden_pool TO service_role;

CREATE TABLE IF NOT EXISTS public.golden_labels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         UUID NOT NULL REFERENCES public.golden_pool(id) ON DELETE CASCADE,
  labeler         TEXT NOT NULL,             -- email; several labelers per item → inter-annotator agreement
  brand_mentioned BOOLEAN NOT NULL,
  prominence      SMALLINT NOT NULL CHECK (prominence BETWEEN 0 AND 3),
  sentiment       TEXT NOT NULL CHECK (sentiment IN ('positive','neutral','negative','none')),
  competitors     TEXT[] NOT NULL DEFAULT '{}',
  notes           TEXT,
  seconds         INT,                        -- labelling time, for throughput planning
  labeled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pool_id, labeler)
);
CREATE INDEX IF NOT EXISTS golden_labels_pool_idx ON public.golden_labels (pool_id);
ALTER TABLE public.golden_labels ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golden_labels TO service_role;
