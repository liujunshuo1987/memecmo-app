-- v0.5 Workspace — multi-tenant schema for the Manus-style GEO platform.
--
-- Hierarchy:
--   memecmo (root)
--     └─ channel_partner (FMVN)
--           └─ end_client (越南 SME A, B, C…)
--     └─ end_client (MemeCMO 自营)
--
-- A *project* = 1 brand × 1 target country. Lives under one organization.
-- A *user* belongs to one or more organizations with a role.
-- An *agent_run* is one invocation of a specialized agent on a project.
-- An *agent_run_event* is one SSE event in the run's activity stream.
-- An *asset* is a durable artifact produced by a run (schema, brief, report).
-- A *chat_message* is one message in the project's conversation thread.

-- ── 1. organizations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,                  -- URL-safe: 'fmvn', 'memecmo'
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('root', 'channel_partner', 'end_client')),
  parent_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending_approval'
                CHECK (status IN ('pending_approval', 'active', 'suspended')),
  billing_email TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orgs_parent  ON public.organizations(parent_org_id);
CREATE INDEX IF NOT EXISTS idx_orgs_type    ON public.organizations(type);
CREATE INDEX IF NOT EXISTS idx_orgs_status  ON public.organizations(status);

-- ── 2. organization_members ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('admin', 'editor', 'viewer')),
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_orgmem_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_orgmem_org  ON public.organization_members(organization_id);

-- ── 3. projects ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,                       -- unique within org
  brand_name      TEXT NOT NULL,
  brand_url       TEXT,
  target_country  TEXT NOT NULL,                       -- 'Vietnam', 'Thailand', etc.
  target_language TEXT,                                -- 'vi', 'th', 'fil', etc.
  industry        TEXT,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'paused', 'archived')),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_projects_org    ON public.projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- ── 4. agent_runs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,                       -- 'discovery' | 'monitor' | 'report' | ...
  triggered_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_method  TEXT NOT NULL DEFAULT 'chat'
                  CHECK (trigger_method IN ('chat', 'schedule', 'api', 'cascade')),
  input_prompt    TEXT,                                -- what the user typed / scheduler context
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'completed', 'failed', 'canceled')),
  progress_pct    INT  NOT NULL DEFAULT 0,
  summary         TEXT,                                -- one-line human result
  output          JSONB,                               -- structured result
  error_message   TEXT,
  model_used      TEXT,
  tokens_in       INT,
  tokens_out      INT,
  cost_usd        NUMERIC(10, 6),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INT GENERATED ALWAYS AS (
                    CASE
                      WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
                      THEN EXTRACT(EPOCH FROM (completed_at - started_at))::int * 1000
                      ELSE NULL
                    END
                  ) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runs_project    ON public.agent_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status     ON public.agent_runs(status) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_runs_agent_id   ON public.agent_runs(agent_id);

-- ── 5. agent_run_events (the activity stream) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_run_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id  UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type    TEXT NOT NULL
                CHECK (event_type IN ('log', 'tool_call', 'tool_result', 'progress', 'output_chunk', 'error', 'milestone')),
  payload       JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_run_ts ON public.agent_run_events(agent_run_id, ts);

-- ── 6. assets (durable artifacts) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_run_id  UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,                         -- 'prompt_set' | 'schema_json_ld' | 'content_brief' |
                                                       --  'aigvr_baseline' | 'weekly_report' | 'monthly_report' |
                                                       --  'competitor_audit' | 'faq' | 'localization'
  title         TEXT NOT NULL,
  format        TEXT NOT NULL CHECK (format IN ('json', 'markdown', 'html', 'pdf', 'image')),
  content       TEXT,                                  -- for json/markdown/html
  file_url      TEXT,                                  -- for pdf/image stored in Blob
  meta          JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assets_project_type ON public.assets(project_id, type, created_at DESC);

-- ── 7. chat_messages (the conversation thread) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content       TEXT NOT NULL,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- null when role='assistant'/'system'
  agent_run_id  UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,  -- if this message spawned a run
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_project_ts ON public.chat_messages(project_id, created_at);

-- ── updated_at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orgs_updated_at ON public.organizations;
CREATE TRIGGER trg_orgs_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.projects;
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Helper: is the caller a member of an org (directly or via parent)? ──────
CREATE OR REPLACE FUNCTION public.is_org_member(target_org UUID)
RETURNS BOOLEAN AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Direct member?
  IF EXISTS (SELECT 1 FROM public.organization_members
             WHERE user_id = uid AND organization_id = target_org) THEN
    RETURN TRUE;
  END IF;

  -- Member of parent org (channel partner sees its end_clients)?
  IF EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.organization_members m ON m.organization_id = o.parent_org_id
    WHERE o.id = target_org
      AND m.user_id = uid
      AND m.role IN ('admin', 'editor')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Member of root MemeCMO org (sees all)?
  IF EXISTS (
    SELECT 1 FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.user_id = uid AND o.type = 'root' AND m.role = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_project_visible(target_project UUID)
RETURNS BOOLEAN AS $$
DECLARE
  proj_org UUID;
BEGIN
  SELECT organization_id INTO proj_org FROM public.projects WHERE id = target_project;
  IF proj_org IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.is_org_member(proj_org);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── Row-Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages         ENABLE ROW LEVEL SECURITY;

-- organizations: members can read; only admins of root can write directly
--   (FMVN approval flow uses service_role to create)
CREATE POLICY org_select ON public.organizations FOR SELECT
  USING (public.is_org_member(id));

-- organization_members: visible to org members; manageable by org admins
CREATE POLICY orgmem_select ON public.organization_members FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY orgmem_insert ON public.organization_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = organization_id
        AND m.user_id = auth.uid()
        AND m.role = 'admin'
    )
  );
CREATE POLICY orgmem_delete ON public.organization_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = organization_id
        AND m.user_id = auth.uid()
        AND m.role = 'admin'
    )
  );

-- projects: members can read; editors+ can write
CREATE POLICY projects_select ON public.projects FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY projects_insert ON public.projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = organization_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'editor')
    )
  );
CREATE POLICY projects_update ON public.projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = organization_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'editor')
    )
  );

-- agent_runs: visible to project visitors; insert from server (service_role) usually
CREATE POLICY runs_select ON public.agent_runs FOR SELECT
  USING (public.is_project_visible(project_id));
CREATE POLICY runs_insert ON public.agent_runs FOR INSERT
  WITH CHECK (public.is_project_visible(project_id));

-- agent_run_events: visible alongside the run; server inserts
CREATE POLICY events_select ON public.agent_run_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.agent_runs r
            WHERE r.id = agent_run_id AND public.is_project_visible(r.project_id))
  );

-- assets: same visibility as the project
CREATE POLICY assets_select ON public.assets FOR SELECT
  USING (public.is_project_visible(project_id));
CREATE POLICY assets_insert ON public.assets FOR INSERT
  WITH CHECK (public.is_project_visible(project_id));

-- chat_messages: members can read/write within their project
CREATE POLICY chat_select ON public.chat_messages FOR SELECT
  USING (public.is_project_visible(project_id));
CREATE POLICY chat_insert ON public.chat_messages FOR INSERT
  WITH CHECK (public.is_project_visible(project_id));

-- ── Seed: MemeCMO root org + FMVN channel partner (pending approval) ────────
INSERT INTO public.organizations (slug, name, type, status, billing_email, metadata)
VALUES
  ('memecmo', 'MemeCMO.ai', 'root', 'active', 'liujunshuo1987@gmail.com',
   '{"is_platform_owner": true, "note": "Root tenant — has visibility into all orgs for QA"}'::jsonb),
  ('fmvn', 'Focus Media Vietnam', 'channel_partner', 'pending_approval', NULL,
   '{"parent_company": "金太阳分众传媒股份公司", "vat_id": "0304705202", "note": "First channel partner — USD 40k initial service contract"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.organizations
SET parent_org_id = (SELECT id FROM public.organizations WHERE slug = 'memecmo')
WHERE slug = 'fmvn' AND parent_org_id IS NULL;

-- ── Comments ────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.organizations IS
  'Multi-tenant root. types: root | channel_partner | end_client. parent_org_id chains end_client to channel_partner.';
COMMENT ON TABLE public.agent_runs IS
  'One row per agent invocation. v0.5 supports agent_id in (discovery, monitor, report). v1 adds competitor, content, schema, faq, localize.';
COMMENT ON TABLE public.agent_run_events IS
  'Append-only SSE event log. Powers the Manus-style right-pane activity feed. Query with realtime channel by agent_run_id.';
COMMENT ON TABLE public.assets IS
  'Durable artifacts produced by runs. Surface in the project asset library.';
COMMENT ON FUNCTION public.is_org_member(UUID) IS
  'RLS helper. Returns true if auth.uid() is a member of the target org, OR is admin of a parent channel_partner, OR is admin of the root MemeCMO org.';
