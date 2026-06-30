-- Architectural entities for ② end-client login (invitations) and ③ commercial
-- (plans / subscriptions / usage metering). Flows (accept invite, Stripe
-- checkout, quota gating) layer on top of these in later work.

-- ── ② Invitations ───────────────────────────────────────────────────────────
-- Invite a person by email into an org; they sign up → accept → become a member.
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days')
);
CREATE INDEX IF NOT EXISTS idx_invites_org   ON public.organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON public.organization_invitations(lower(email));
CREATE INDEX IF NOT EXISTS idx_invites_token ON public.organization_invitations(token);

-- ── ③ Commercial: plans (the contract's Basic/Standard/Premium packages) ──────
CREATE TABLE IF NOT EXISTS public.plans (
  id                 TEXT PRIMARY KEY,            -- 'basic' | 'standard' | 'premium'
  name               TEXT NOT NULL,
  monthly_scan_quota INT  NOT NULL,               -- full GEO scans per period
  max_projects       INT  NOT NULL,
  price_usd_month     NUMERIC,
  features           JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort               INT  NOT NULL DEFAULT 0
);

INSERT INTO public.plans (id, name, monthly_scan_quota, max_projects, price_usd_month, features, sort) VALUES
  ('basic',    'Basic',     2,  1,  NULL, '{"engines":4,"reports":"monthly","content":"limited"}'::jsonb, 1),
  ('standard', 'Standard',  8,  5,  NULL, '{"engines":5,"real_surface":true,"reports":"weekly","content":"full","distribute":true}'::jsonb, 2),
  ('premium',  'Premium',  30, 20,  NULL, '{"engines":5,"real_surface":true,"reports":"weekly","content":"full","distribute":true,"encyclopedia":true,"priority":true}'::jsonb, 3)
ON CONFLICT (id) DO NOTHING;

-- ── ③ Commercial: per-org subscription ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id                TEXT NOT NULL REFERENCES public.plans(id),
  status                 TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled')),
  current_period_start   TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end     TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subs_org ON public.org_subscriptions(organization_id);

-- ── ③ Commercial: usage metering (count runs against quota) ──────────────────
CREATE TABLE IF NOT EXISTS public.usage_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  agent_run_id    UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,                  -- 'full_scan' | 'monitor' | 'optimize' | ...
  qty             INT  NOT NULL DEFAULT 1,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_org_ts ON public.usage_events(organization_id, ts);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events              ENABLE ROW LEVEL SECURITY;

-- Org members read their org's invitations/subscription/usage; writes go through
-- service-role server endpoints (provisioning, billing webhooks).
DROP POLICY IF EXISTS invites_select ON public.organization_invitations;
CREATE POLICY invites_select ON public.organization_invitations FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS subs_select ON public.org_subscriptions;
CREATE POLICY subs_select ON public.org_subscriptions FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS usage_select ON public.usage_events;
CREATE POLICY usage_select ON public.usage_events FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- Plans are a public catalogue.
DROP POLICY IF EXISTS plans_select ON public.plans;
CREATE POLICY plans_select ON public.plans FOR SELECT TO authenticated, anon USING (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT SELECT ON public.organization_invitations TO authenticated;
GRANT SELECT ON public.org_subscriptions        TO authenticated;
GRANT SELECT ON public.usage_events             TO authenticated;
GRANT SELECT ON public.plans                     TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invitations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_subscriptions        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_events             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans                     TO service_role;
