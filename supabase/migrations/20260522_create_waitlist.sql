-- Waitlist Table — Tier 0 entry gate for MemeCMO.ai
-- See: docs/GUANLAN_AGENT_LIBRARY.md, GEO_AEO_ALGORITHM_LOG.md
--
-- Lifecycle:
--   anonymous visitor → /waitlist form → INSERT (status='pending')
--   founder reviews Wednesday 09:00 → approved/rejected/expired
--   approved → signup_token issued → user clicks magic link → signs up → user_id linked
--
-- Design notes:
-- - Anyone (anon) can INSERT a row but cannot SELECT any rows directly.
-- - Position/status lookup is via security-definer function `get_waitlist_status(email)`.
--   This prevents the table from becoming an open email-list leak.
-- - Public stats counter is exposed via the `waitlist_public_stats` view.

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Intake (required)
  email TEXT NOT NULL UNIQUE,
  brand_or_company TEXT NOT NULL,
  brand_of_interest TEXT NOT NULL,

  -- Intake (optional; presence raises priority_score)
  role TEXT,
  target_market TEXT CHECK (target_market IS NULL OR target_market IN ('overseas','china','global','other')),
  geo_challenge TEXT,

  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired','signed_up')),

  -- Priority score (0-100) computed at insert time from optional field completeness
  -- Used to rank within a weekly approval batch. Founder can override manually.
  priority_score INT NOT NULL DEFAULT 0,

  -- Approval audit trail
  approved_at TIMESTAMPTZ,
  approved_in_batch DATE,            -- which Wednesday's batch (UTC date)
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,

  -- Magic-link signup token (issued on approval, consumed on signup)
  signup_token TEXT UNIQUE,
  signup_token_expires_at TIMESTAMPTZ,

  -- Linked auth user (populated after they sign up via magic link)
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_up_at TIMESTAMPTZ,

  -- Acquisition tracking
  source TEXT,                       -- 'organic' | 'sea_command_center_cta' | 'twitter' | etc.
  referrer_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,

  -- Light anti-abuse fingerprint (sha256 of IP + salt, NOT raw IP for privacy)
  ip_hash TEXT,
  user_agent_excerpt TEXT,           -- truncated UA, max 200 chars at insert time

  -- Engagement / nurture tracking
  confirmation_email_sent_at TIMESTAMPTZ,
  last_nurture_sent_at TIMESTAMPTZ,
  nurture_sequence_step INT NOT NULL DEFAULT 0,
  approval_email_sent_at TIMESTAMPTZ,

  -- Standard timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Sanity constraints
  CONSTRAINT email_lowercase CHECK (email = lower(email)),
  CONSTRAINT email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT priority_range CHECK (priority_score BETWEEN 0 AND 100)
);

-- Indexes
-- email is UNIQUE → already indexed
CREATE INDEX idx_waitlist_status_priority_created
  ON waitlist (status, priority_score DESC, created_at ASC)
  WHERE status = 'pending';
CREATE INDEX idx_waitlist_created ON waitlist (created_at DESC);
CREATE INDEX idx_waitlist_approved_batch
  ON waitlist (approved_in_batch)
  WHERE status = 'approved';
CREATE INDEX idx_waitlist_signup_token
  ON waitlist (signup_token)
  WHERE signup_token IS NOT NULL;

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION waitlist_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waitlist_touch_updated_at ON waitlist;
CREATE TRIGGER waitlist_touch_updated_at
  BEFORE UPDATE ON waitlist
  FOR EACH ROW EXECUTE FUNCTION waitlist_touch_updated_at();

-- Auto-compute priority_score at INSERT based on optional field completeness
-- Each optional field present = 20 points (max 60 for the 3 optional intake fields).
-- Bonus: target_market chosen = +10. Maxes at 70 from algorithmic input.
-- Reserved 71-100 range for manual founder override.
CREATE OR REPLACE FUNCTION waitlist_compute_priority()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.priority_score = 0 THEN  -- only auto-compute if caller didn't override
    NEW.priority_score :=
      (CASE WHEN coalesce(length(NEW.role), 0) > 0 THEN 20 ELSE 0 END) +
      (CASE WHEN coalesce(length(NEW.geo_challenge), 0) >= 30 THEN 20 ELSE 0 END) +
      (CASE WHEN NEW.target_market IS NOT NULL THEN 10 ELSE 0 END) +
      (CASE WHEN coalesce(length(NEW.brand_or_company), 0) >= 3 THEN 10 ELSE 0 END);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waitlist_compute_priority ON waitlist;
CREATE TRIGGER waitlist_compute_priority
  BEFORE INSERT ON waitlist
  FOR EACH ROW EXECUTE FUNCTION waitlist_compute_priority();

-- ── Row Level Security ───────────────────────────────────────────────────
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Anonymous + authenticated can INSERT (joining the waitlist requires no auth)
-- but inserts cannot set sensitive columns. Restrict with a column-level grant.
CREATE POLICY "Anyone can join waitlist" ON waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- caller cannot set status, approval fields, signup token, or user_id at insert time
    status = 'pending'
    AND approved_at IS NULL
    AND approved_in_batch IS NULL
    AND approved_by IS NULL
    AND signup_token IS NULL
    AND signup_token_expires_at IS NULL
    AND user_id IS NULL
    AND signed_up_at IS NULL
    AND approval_email_sent_at IS NULL
  );

-- A signed-up user can read their own row (linked via user_id) — needed for
-- showing their own status / report history later.
CREATE POLICY "Signed-up user reads own row" ON waitlist
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Note: no UPDATE/DELETE policies. All admin mutations go through service_role
-- key from server-side code (/admin/waitlist tooling).

-- ── Public lookup function (security-definer) ────────────────────────────
-- Anonymous users can call this with their own email to learn their position
-- and status. We don't expose the rest of the table.
CREATE OR REPLACE FUNCTION get_waitlist_status(p_email TEXT)
RETURNS TABLE (
  status TEXT,
  queue_position INT,
  total_pending INT,
  joined_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_email TEXT;
BEGIN
  v_email := lower(trim(p_email));
  RETURN QUERY
  WITH me AS (
    SELECT w.status AS me_status, w.priority_score, w.created_at AS me_created_at, w.approved_at AS me_approved_at
    FROM waitlist w WHERE w.email = v_email
  ),
  pending_total AS (
    SELECT count(*)::INT AS n FROM waitlist w WHERE w.status = 'pending'
  ),
  pos AS (
    SELECT count(*)::INT + 1 AS p
    FROM waitlist w, me
    WHERE w.status = 'pending'
      AND (w.priority_score, w.created_at) <
          (me.priority_score, me.me_created_at)
  )
  SELECT
    me.me_status,
    CASE WHEN me.me_status = 'pending' THEN pos.p ELSE NULL END,
    pending_total.n,
    me.me_created_at,
    me.me_approved_at
  FROM me, pos, pending_total;
END;
$$;

GRANT EXECUTE ON FUNCTION get_waitlist_status(TEXT) TO anon, authenticated;

-- ── Public stats view ────────────────────────────────────────────────────
-- Exposes only aggregate counts for the public "已有 N brands joined · 本周新增 M" counter
CREATE OR REPLACE VIEW waitlist_public_stats AS
SELECT
  count(*)::INT AS total_joined,
  count(*) FILTER (WHERE created_at >= date_trunc('week', now()))::INT AS joined_this_week,
  count(*) FILTER (WHERE status = 'approved' OR status = 'signed_up')::INT AS total_admitted
FROM waitlist;

GRANT SELECT ON waitlist_public_stats TO anon, authenticated;

-- ── Column-level grants ──────────────────────────────────────────────────
-- Anon role can INSERT but only into the safe intake columns
REVOKE ALL ON waitlist FROM anon, authenticated, public;
GRANT INSERT (
  email,
  brand_or_company,
  brand_of_interest,
  role,
  target_market,
  geo_challenge,
  source,
  referrer_url,
  utm_source,
  utm_medium,
  utm_campaign,
  user_agent_excerpt,
  ip_hash
) ON waitlist TO anon, authenticated;

GRANT SELECT ON waitlist TO authenticated;  -- gated further by RLS to own row only

-- ── Comments for future maintainers ──────────────────────────────────────
COMMENT ON TABLE waitlist IS
  'Tier 0 entry gate. Lifecycle: pending -> approved (Wed 09:00 batch) -> signed_up. See docs/AGENT_LIBRARY.md.';
COMMENT ON COLUMN waitlist.priority_score IS
  '0-70 auto-computed from optional intake completeness; 71-100 reserved for manual founder override.';
COMMENT ON COLUMN waitlist.approved_in_batch IS
  'UTC date of the Wednesday batch when this entry was approved. Null for non-approved.';
COMMENT ON COLUMN waitlist.signup_token IS
  'One-time magic-link token sent in approval email. Consumed when user signs up. Generated server-side via crypto.randomUUID() or similar.';
COMMENT ON FUNCTION get_waitlist_status(TEXT) IS
  'Public-callable lookup so anonymous users can see their own position. Caller passes their email; function returns status/position/total. Does not require authentication on purpose — the waitlist exists pre-signup.';
