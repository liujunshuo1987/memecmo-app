// Channel provisioning (layer ②).
//
// POST /api/workspace/orgs  — a channel_partner admin creates an end_client org
//   under their org (status 'pending_approval' until MemeCMO approves).
// GET  /api/workspace/orgs?pending=1 — list pending-approval orgs the caller can
//   see (root admin sees all → the approval queue).
//
// organizations has no INSERT/UPDATE RLS policy by design, so writes go through
// the service role AFTER verifying the caller's rights with their authed client.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { parentOrgSlug?: string; name?: string; slug?: string; billingEmail?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (!body.parentOrgSlug || !body.name?.trim()) {
    return NextResponse.json({ error: 'Missing parentOrgSlug or name' }, { status: 400 });
  }

  // Parent must be visible to the caller (RLS) and a channel_partner/root.
  const { data: parent } = await supabase
    .from('organizations')
    .select('id, type, status')
    .eq('slug', body.parentOrgSlug)
    .maybeSingle();
  if (!parent) return NextResponse.json({ error: 'Parent org not found or no access' }, { status: 404 });
  if (parent.type === 'end_client') {
    return NextResponse.json({ error: 'End-client orgs cannot have sub-clients' }, { status: 400 });
  }
  // Caller must be an admin of the parent org.
  const { data: mem } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', parent.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!mem || mem.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin of the parent org can add a client' }, { status: 403 });
  }

  const sb = svc();
  const slug = (body.slug && slugify(body.slug)) || slugify(body.name) || `client-${Date.now()}`;
  const { data: org, error: insErr } = await sb
    .from('organizations')
    .insert({
      slug,
      name: body.name.trim(),
      type: 'end_client',
      parent_org_id: parent.id,
      status: 'pending_approval',
      billing_email: body.billingEmail || null,
    })
    .select('*')
    .single();
  if (insErr) {
    if (insErr.code === '23505') return NextResponse.json({ error: 'That slug is already taken' }, { status: 409 });
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  // Creator becomes admin of the new org so they can manage it.
  await sb.from('organization_members').insert({ organization_id: org.id, user_id: user.id, role: 'admin', invited_by: user.id });

  return NextResponse.json({ ok: true, org });
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pending = req.nextUrl.searchParams.get('pending');
  // RLS limits rows to what the caller can see (root admin → all).
  let q = supabase.from('organizations').select('id, slug, name, type, status, parent_org_id, created_at');
  if (pending) q = q.eq('status', 'pending_approval');
  const { data } = await q.order('created_at', { ascending: false });
  return NextResponse.json({ orgs: data ?? [] });
}
