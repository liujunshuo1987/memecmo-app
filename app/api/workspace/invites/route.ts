// Invitations (②) — make end clients real, loggable-in users.
//
// POST /api/workspace/invites  — an admin of the org (or its parent channel
//   partner, or root) invites a person by email. Returns an accept URL.
// GET  /api/workspace/invites?orgId=… — list pending invites for an org.
//
// organization_invitations writes go through the service role after verifying
// the caller's admin rights with their authed client.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** True if `userId` may administer `orgId` — admin of the org, its parent, or root. */
async function canAdminOrg(authed: ReturnType<typeof createClient>, userId: string, org: { id: string; parent_org_id: string | null }): Promise<boolean> {
  const ids = [org.id];
  if (org.parent_org_id) ids.push(org.parent_org_id);
  const { data: mems } = await authed
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .in('organization_id', ids)
    .eq('role', 'admin');
  if (mems && mems.length) return true;
  // Root admin can administer anything.
  const { data: root } = await authed.from('organizations').select('id').eq('type', 'root').maybeSingle();
  if (!root) return false;
  const { data: rmem } = await authed
    .from('organization_members')
    .select('role')
    .eq('organization_id', root.id)
    .eq('user_id', userId)
    .maybeSingle();
  return rmem?.role === 'admin';
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { orgId?: string; orgSlug?: string; email?: string; role?: 'admin' | 'editor' | 'viewer' };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  const role = body.role && ['admin', 'editor', 'viewer'].includes(body.role) ? body.role : 'viewer';

  // Resolve the target org (must be visible to caller via RLS).
  let orgQ = supabase.from('organizations').select('id, name, slug, parent_org_id');
  orgQ = body.orgId ? orgQ.eq('id', body.orgId) : orgQ.eq('slug', body.orgSlug ?? '');
  const { data: org } = await orgQ.maybeSingle();
  if (!org) return NextResponse.json({ error: 'Org not found or no access' }, { status: 404 });

  if (!(await canAdminOrg(supabase, user.id, org))) {
    return NextResponse.json({ error: 'Only an admin of this org can invite members' }, { status: 403 });
  }

  const sb = serviceClient();
  const { data: invite, error } = await sb
    .from('organization_invitations')
    .insert({ organization_id: org.id, email, role, invited_by: user.id })
    .select('id, token, email, role, expires_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const base = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const acceptUrl = `${base}/invite/${invite.token}`;
  return NextResponse.json({ ok: true, invite: { ...invite, token: undefined }, acceptUrl, org: { name: org.name, slug: org.slug } });
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get('orgId');
  let q = supabase
    .from('organization_invitations')
    .select('id, organization_id, email, role, status, created_at, expires_at')
    .eq('status', 'pending');
  if (orgId) q = q.eq('organization_id', orgId);
  const { data } = await q.order('created_at', { ascending: false });
  return NextResponse.json({ invites: data ?? [] });
}
