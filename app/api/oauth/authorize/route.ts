// Consent decision (POST from /oauth/authorize). Re-validates everything the
// page validated — client, redirect_uri, PKCE, the signed-in user and their
// membership of the chosen organization — then issues a code and redirects.
// Same-origin only: a cross-site form post never carries the session cookie
// (SameSite=Lax) and is rejected on Sec-Fetch-Site as well.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessOrg, canEditOrg } from '@/lib/org-auth';
import { validateAuthorizeRequest, issueCode, redirectWith, OAuthError, ISSUER } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sfs = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  if ((sfs && sfs !== 'same-origin' && sfs !== 'none') || (origin && origin !== ISSUER && origin !== req.nextUrl.origin)) {
    return NextResponse.json({ error: 'forbidden', message: 'cross-site consent is not accepted' }, { status: 403 });
  }
  const form = await req.formData();
  const q = new URLSearchParams();
  for (const k of ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'resource']) {
    const v = form.get(k); if (typeof v === 'string' && v) q.set(k, v);
  }
  let authz;
  try { authz = await validateAuthorizeRequest(q); }
  catch (e) { return NextResponse.json({ error: e instanceof OAuthError ? e.code : 'invalid_request', error_description: e instanceof Error ? e.message : String(e) }, { status: 400 }); }

  const decision = form.get('decision');
  if (decision !== 'allow') {
    return NextResponse.redirect(redirectWith(authz.redirectUri, { error: 'access_denied', error_description: 'The user declined', state: authz.state }), 303);
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${req.nextUrl.origin}/login?redirect=${encodeURIComponent(`/oauth/authorize?${q.toString()}`)}`, 303);

  const orgId = String(form.get('organization_id') || '');
  const { data: org } = await supabase.from('organizations').select('id, parent_org_id, status').eq('id', orgId).maybeSingle();
  if (!org || org.status !== 'active' || !(await canAccessOrg(supabase, user.id, org))) {
    return NextResponse.json({ error: 'access_denied', error_description: 'You are not a member of that organization' }, { status: 403 });
  }
  // write (log_action) needs editor or admin; everyone else gets read only.
  let scopes = authz.scopes;
  if (scopes.includes('write') && !(await canEditOrg(supabase, user.id, org))) scopes = scopes.filter((s) => s !== 'write');
  if (!scopes.length) scopes = ['read'];

  const code = await issueCode(authz, user.id, org.id, scopes);
  return NextResponse.redirect(redirectWith(authz.redirectUri, { code, state: authz.state }), 303);
}
