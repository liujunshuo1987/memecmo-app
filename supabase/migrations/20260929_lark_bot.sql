-- Lark collaboration bot "GEO Assistant (MemeCMO)" — FMVN × MemeCMO tech plan v1.0 §7.
-- The bot is the flywheel's entry point: team members @ it in the project group
-- and their actions land in the platform, signed with their own account.
-- All tables are service-role only (the webhook and the Inngest worker); no
-- client ever reads them directly.

-- One group chat ↔ one project, so a record can never land in the wrong project.
CREATE TABLE IF NOT EXISTS public.lark_bindings (
  chat_id     TEXT PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by  TEXT,                          -- email of the operator who bound it
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every event the bot receives. Lark retries a delivery it thinks failed; the
-- unique event_id turns a retry into a no-op. Rolling 90-day retention.
CREATE TABLE IF NOT EXISTS public.lark_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        TEXT NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,
  chat_id         TEXT,
  message_id      TEXT,
  sender_open_id  TEXT,
  msg_type        TEXT,
  content         JSONB,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at      TIMESTAMPTZ,
  outcome         TEXT,                      -- what the bot did, e.g. 'hanhdong:card', 'bind:ok', 'ignored:unbound'
  reply_id        TEXT
);
CREATE INDEX IF NOT EXISTS lark_messages_chat_idx ON public.lark_messages (chat_id, ts DESC);

-- MAAU requests (/maau): specs written by the client team, built by MemeCMO.
-- ETA is set by a person only — a delivery date is a commitment (red zone).
CREATE TABLE IF NOT EXISTS public.maau_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by     UUID,
  lark_message_id  TEXT,
  spec             JSONB NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','analysing','building','running','paused')),
  status_note      TEXT,
  eta              DATE,
  built_ref        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maau_requests_project_idx ON public.maau_requests (project_id, created_at DESC);

-- Where an action was logged from.
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'web';
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS lark_message_id TEXT;
DO $$ BEGIN
  ALTER TABLE public.interventions ADD CONSTRAINT interventions_channel_chk CHECK (channel IN ('web','lark'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.lark_bindings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lark_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maau_requests  ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lark_bindings, public.lark_messages, public.maau_requests TO service_role;

-- Identity mapping: Lark email → platform account. Service role only; never
-- exposed to anon/authenticated (it would let anyone probe who has an account).
CREATE OR REPLACE FUNCTION public.user_id_by_email(p_email TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_id_by_email(TEXT) TO service_role;
