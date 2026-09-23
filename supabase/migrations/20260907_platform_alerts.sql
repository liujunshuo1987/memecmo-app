-- Durable operator alerts.
--
-- An alert that exists only as an outbound email is fragile: if the mail
-- provider fails, or the recipient env var is unset (it was, on 2026-09-07),
-- the platform has no record that anything went wrong. The row is written
-- FIRST; email delivery is recorded against it. This is also the evidence a
-- verification run can check without depending on log streams.
CREATE TABLE IF NOT EXISTS public.platform_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  detail       TEXT,
  agent_run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  project_id   UUID REFERENCES public.projects(id)   ON DELETE SET NULL,
  recipients   TEXT[] NOT NULL DEFAULT '{}',
  delivered    BOOLEAN NOT NULL DEFAULT false,
  delivery_err TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_alerts_created_idx ON public.platform_alerts (created_at DESC);
ALTER TABLE public.platform_alerts ENABLE ROW LEVEL SECURITY;
-- Operator-only table: no policies for authenticated; service role bypasses RLS.
GRANT SELECT, INSERT, UPDATE ON public.platform_alerts TO service_role;
