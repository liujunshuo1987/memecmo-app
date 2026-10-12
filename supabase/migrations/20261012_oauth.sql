-- OAuth 2.1 authorization server for the MemeCMO Connector, so Claude.ai,
-- ChatGPT and other directory clients sign the user in instead of pasting a
-- key: RFC 8414 metadata, RFC 7591 dynamic registration (plus Client ID
-- Metadata Documents), authorization code + PKCE (S256), rotating refresh
-- tokens. Only hashes of codes and tokens are stored. Service role only.

CREATE TABLE IF NOT EXISTS public.oauth_clients (
  client_id                  TEXT PRIMARY KEY,                         -- 'mcc_…' (registered) or the https:// metadata URL (CIMD)
  kind                       TEXT NOT NULL CHECK (kind IN ('dcr','cimd')),
  client_name                TEXT,
  client_uri                 TEXT,
  redirect_uris              TEXT[] NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  client_secret_hash         TEXT,
  metadata                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at               TIMESTAMPTZ
);
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.oauth_clients TO service_role;

CREATE TABLE IF NOT EXISTS public.oauth_codes (
  code_hash             TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id               UUID NOT NULL,
  organization_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scopes                TEXT[] NOT NULL,
  redirect_uri          TEXT NOT NULL,
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  resource              TEXT,
  expires_at            TIMESTAMPTZ NOT NULL,
  used_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.oauth_codes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.oauth_codes TO service_role;

CREATE TABLE IF NOT EXISTS public.oauth_tokens (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash         TEXT NOT NULL UNIQUE,
  refresh_hash       TEXT UNIQUE,
  client_id          TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id            UUID NOT NULL,
  organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scopes             TEXT[] NOT NULL,
  resource           TEXT,
  expires_at         TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON public.oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_org  ON public.oauth_tokens(organization_id);
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.oauth_tokens TO service_role;

-- Calls and actions made with a signed-in user's token carry the user and the token.
ALTER TABLE public.connector_events
  ADD COLUMN IF NOT EXISTS oauth_token_id UUID REFERENCES public.oauth_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_id        UUID;
ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS oauth_token_id UUID REFERENCES public.oauth_tokens(id) ON DELETE SET NULL;
