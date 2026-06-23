-- Fix for get_waitlist_status: "column reference 'status' is ambiguous"
--
-- Root cause: The CTE `me` exposed columns whose names (status, created_at,
-- approved_at) collided with the OUT parameter names from RETURNS TABLE.
-- PostgreSQL couldn't disambiguate when the final SELECT projected them.
--
-- Fix: alias the CTE columns to unique names (me_status, me_created_at,
-- me_approved_at) so the final SELECT projection has no collision with the
-- function's RETURNS TABLE column names.

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
    SELECT
      w.status        AS me_status,
      w.priority_score,
      w.created_at    AS me_created_at,
      w.approved_at   AS me_approved_at
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
