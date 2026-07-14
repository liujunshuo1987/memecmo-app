-- Follow-up to 20260709: with waitlist_public_stats now security_invoker,
-- the service role needs a real SELECT grant on the underlying table
-- (BYPASSRLS skips policies, not table privileges — the old definer view
-- had been masking this missing grant).
GRANT SELECT ON public.waitlist TO service_role;
