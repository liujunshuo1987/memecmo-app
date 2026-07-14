-- Clear the last Security Advisor error: waitlist_public_stats was a
-- SECURITY DEFINER view (it aggregated over RLS-protected waitlist rows so
-- the public landing counter could work for anon). Now that its only
-- consumer (app/waitlist/page.tsx, server-side) reads it with the service
-- role — which bypasses RLS anyway — the view can enforce the caller's
-- permissions like everything else.
ALTER VIEW public.waitlist_public_stats SET (security_invoker = true);

-- Intent made explicit: this is a server-side aggregate, not a public API.
REVOKE SELECT ON public.waitlist_public_stats FROM anon;
GRANT SELECT ON public.waitlist_public_stats TO service_role;
