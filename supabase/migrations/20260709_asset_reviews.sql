-- Client verification workflow (CMO review P1): the agency sends the brand
-- profile / prompt library / competitor set to the CLIENT for sign-off. The
-- client opens a tokenized public page (no login) and approves or requests
-- changes. A content snapshot is stored so the approval is anchored to what
-- was actually shown.

CREATE TABLE IF NOT EXISTS public.asset_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('brand_profile', 'prompt_set', 'competitor_set')),
  token        TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested')),
  client_email TEXT NOT NULL,
  snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb,
  note         TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reviews_project ON public.asset_reviews(project_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_token   ON public.asset_reviews(token);

ALTER TABLE public.asset_reviews ENABLE ROW LEVEL SECURITY;

-- Org members read their project's reviews; all writes go through
-- service-role endpoints (request = authed member check; decide = token).
DROP POLICY IF EXISTS reviews_select ON public.asset_reviews;
CREATE POLICY reviews_select ON public.asset_reviews FOR SELECT TO authenticated
  USING (public.is_project_visible(project_id));

GRANT SELECT ON public.asset_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_reviews TO service_role;
