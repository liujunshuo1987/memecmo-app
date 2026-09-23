-- Daily engine liveness patrol results (lib/engines/health.ts). One row per
-- run; `alerts` lists the alert kinds raised so a healthy day is an empty
-- array, not a missing row — "the patrol did not run" is distinguishable
-- from "nothing was wrong".
CREATE TABLE IF NOT EXISTS public.engine_health_checks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ NOT NULL,
  healthy    BOOLEAN NOT NULL,
  capacity   BOOLEAN NOT NULL DEFAULT false,
  probes     JSONB NOT NULL,
  serpapi    JSONB,
  alerts     TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS engine_health_checks_checked_idx ON public.engine_health_checks (checked_at DESC);
ALTER TABLE public.engine_health_checks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.engine_health_checks TO service_role;
