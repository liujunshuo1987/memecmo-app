// Connector keys — issued and revoked by organization admins, listed for members.
//
// GET    ?orgId=            → { keys: [{ id, name, keyPrefix, scopes, createdAt, lastUsedAt, revokedAt }] }
// POST   { orgId, name, scopes? }  → { key, id, keyPrefix }   (the full key is returned ONCE)
// DELETE ?orgId=&id=        → revoke (rows are kept for the audit trail)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAccessOrg, canAdminOrg } from '@/lib/org-auth';
import { generateKey } from '@/lib/connector/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ACTIVE_KEYS = 10;

async function authorize(orgId: string, mode: 'read' | 'admin') {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: org } = await supabase.from('organizations').select('id, parent_org_id, slug').eq('id', orgId).maybeSingle();
  if (!org) return { error: NextResponse.json({ error: 'Org not found or no access' }, { status: 404 }) };
  const ok = mode === 'admin' ? await canAdminOrg(supabase, user.id, org) : await canAccessOrg(supabase, user.id, org);
  if (!ok) return { error: NextResponse.json({ error: mode === 'admin' ? 'Only org admins can manage connector keys' : 'Forbidden' }, { status: 403 }) };
  return { user, org };
}

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  const a = await authorize(orgId, 'read');
  if ('error' in a) return a.error;
  const { data, error } = await serviceClient()
    .from('connector_keys')
    .select('id, name, key_prefix, scopes, created_at, last_used_at, revoked_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    keys: (data ?? []).map((k) => ({ id: k.id, name: k.name, keyPrefix: k.key_prefix, scopes: k.scopes, createdAt: k.created_at, lastUsedAt: k.last_used_at, revokedAt: k.revoked_at })),
  });
}

export async function POST(req: NextRequest) {
  let body: { orgId?: string; name?: string; scopes?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const orgId = body.orgId, name = (body.name || '').trim().slice(0, 60);
  if (!orgId || !name) return NextResponse.json({ error: 'Missing orgId or name' }, { status: 400 });
  const scopes = Array.isArray(body.scopes) && body.scopes.length ? body.scopes.filter((s) => s === 'read' || s === 'write') : ['read', 'write'];
  if (!scopes.includes('read')) scopes.unshift('read');
  const a = await authorize(orgId, 'admin');
  if ('error' in a) return a.error;
  const svc = serviceClient();
  const { count } = await svc.from('connector_keys').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('revoked_at', null);
  if ((count ?? 0) >= MAX_ACTIVE_KEYS) return NextResponse.json({ error: `At most ${MAX_ACTIVE_KEYS} active keys per organization — revoke one first.` }, { status: 400 });
  const { key, prefix, hash } = generateKey();
  const { data, error } = await svc
    .from('connector_keys')
    .insert({ organization_id: orgId, name, key_prefix: prefix, key_hash: hash, scopes, created_by: a.user.id })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id, key, keyPrefix: prefix, scopes });
}

export async function DELETE(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const orgId = q.get('orgId'), id = q.get('id');
  if (!orgId || !id) return NextResponse.json({ error: 'Missing orgId or id' }, { status: 400 });
  const a = await authorize(orgId, 'admin');
  if ('error' in a) return a.error;
  const { error } = await serviceClient().from('connector_keys').update({ revoked_at: new Date().toISOString() }).eq('organization_id', orgId).eq('id', id).is('revoked_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
