-- Billing v2 — shareholder-approved 2026-07 pricing structure.
-- ① plan policy levers (scan cadence / prompt caps / engines / included credits)
-- ② approved list prices, SEA + US lines
-- ③ credit double-pool ledger (granted vs purchased)

-- ── ① plan policy columns ────────────────────────────────────────────────────
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS region                    TEXT NOT NULL DEFAULT 'sea',
  ADD COLUMN IF NOT EXISTS scan_cadence              TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS prompt_library_cap        INT  NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS sampled_per_scan          INT  NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS engines                   INT  NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS included_credits_monthly  INT  NOT NULL DEFAULT 0;

-- ── ② approved prices & levers ───────────────────────────────────────────────
UPDATE public.plans SET price_usd_month = 299,  scan_cadence = 'monthly',
  prompt_library_cap = 60,  sampled_per_scan = 12, engines = 4,
  included_credits_monthly = 0,   max_projects = 1  WHERE id = 'basic';
UPDATE public.plans SET price_usd_month = 799,  scan_cadence = 'biweekly',
  prompt_library_cap = 110, sampled_per_scan = 20, engines = 5,
  included_credits_monthly = 50,  max_projects = 3  WHERE id = 'standard';
UPDATE public.plans SET price_usd_month = 1999, scan_cadence = 'weekly',
  prompt_library_cap = 150, sampled_per_scan = 24, engines = 5,
  included_credits_monthly = 150, max_projects = 10 WHERE id = 'premium';

INSERT INTO public.plans (id, name, monthly_scan_quota, max_projects, price_usd_month, features, sort,
                          region, scan_cadence, prompt_library_cap, sampled_per_scan, engines, included_credits_monthly) VALUES
  ('us_basic',    'US Basic',    2,  1,  449,  '{"engines":4,"reports":"monthly","content":"limited"}'::jsonb, 11,
   'us', 'monthly',  60, 12, 4, 0),
  ('us_standard', 'US Standard', 8,  3,  1199, '{"engines":5,"real_surface":true,"reports":"weekly","content":"full","distribute":true}'::jsonb, 12,
   'us', 'biweekly', 110, 20, 5, 50),
  ('us_premium',  'US Premium',  30, 10, 2999, '{"engines":5,"real_surface":true,"reports":"weekly","content":"full","distribute":true,"encyclopedia":true,"priority":true}'::jsonb, 13,
   'us', 'weekly',  150, 24, 5, 150)
ON CONFLICT (id) DO UPDATE SET
  price_usd_month = EXCLUDED.price_usd_month, region = EXCLUDED.region,
  scan_cadence = EXCLUDED.scan_cadence, prompt_library_cap = EXCLUDED.prompt_library_cap,
  sampled_per_scan = EXCLUDED.sampled_per_scan, engines = EXCLUDED.engines,
  included_credits_monthly = EXCLUDED.included_credits_monthly, max_projects = EXCLUDED.max_projects;

-- ── ③ credit ledger (double pool: granted spends first, purchased invoiceable)
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pool             TEXT NOT NULL CHECK (pool IN ('granted', 'purchased')),
  delta            INT  NOT NULL,                -- positive = credit in, negative = spend
  kind             TEXT NOT NULL,                -- 'grant' | 'purchase' | 'spend' | 'adjust'
  reason           TEXT,                          -- e.g. 'full_scan', 'monthly_grant', 'stripe:cs_...'
  agent_run_id     UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_org_idx ON public.credit_ledger (organization_id, created_at DESC);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
-- Members can see their org's ledger; all writes go through the service role.
DROP POLICY IF EXISTS credit_ledger_select ON public.credit_ledger;
CREATE POLICY credit_ledger_select ON public.credit_ledger FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL    ON public.credit_ledger TO service_role;
