-- MemeCMO Connector (MCP server at /api/mcp) — per-organization bearer keys
-- and a usage log. Decided 2026-10-11: distribution runs in the client's own
-- environment (Zapier / Make / Claude / ChatGPT); MemeCMO exposes measurement,
-- deliverables and the action ledger as a connector and never holds social
-- tokens. Keys are issued by org admins in the dashboard; only the sha256 hash
-- is stored, the key itself is shown once.

CREATE TABLE IF NOT EXISTS public.connector_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_prefix      TEXT NOT NULL,                             -- "mc_ab12cd34" — what the dashboard shows
  key_hash        TEXT NOT NULL UNIQUE,                      -- sha256(full key), hex
  scopes          TEXT[] NOT NULL DEFAULT ARRAY['read','write'],
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_connector_keys_org ON public.connector_keys(organization_id);
ALTER TABLE public.connector_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS connector_keys_select ON public.connector_keys;
CREATE POLICY connector_keys_select ON public.connector_keys FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
GRANT SELECT ON public.connector_keys TO authenticated;
GRANT ALL ON public.connector_keys TO service_role;

-- One row per tool call: the basis for metering and for the "who used what"
-- audit. Service role only.
CREATE TABLE IF NOT EXISTS public.connector_events (
  id              BIGSERIAL PRIMARY KEY,
  key_id          UUID REFERENCES public.connector_keys(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL,
  project_id      UUID,
  tool            TEXT NOT NULL,
  ok              BOOLEAN NOT NULL DEFAULT true,
  ms              INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connector_events_org_ts ON public.connector_events(organization_id, created_at DESC);
ALTER TABLE public.connector_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.connector_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.connector_events_id_seq TO service_role;

-- Actions logged through the connector: reuse the Lark bot's `channel` column
-- (web | lark) and add the key that vouched for the call. logged_by is the
-- admin who issued the key.
ALTER TABLE public.interventions DROP CONSTRAINT IF EXISTS interventions_channel_chk;
ALTER TABLE public.interventions ADD CONSTRAINT interventions_channel_chk CHECK (channel IN ('web','lark','connector'));
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS connector_key_id UUID REFERENCES public.connector_keys(id) ON DELETE SET NULL;
