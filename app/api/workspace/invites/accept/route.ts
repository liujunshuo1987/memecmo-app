// POST /api/workspace/invites/accept — a logged-in user accepts an invitation
// by token and becomes a member of the org. Body: { token }.
//
// Security: the invite is addressed to a specific email; the accepting user's
// email must match (case-insensitive). This binds the membership to the person
// the org admin intended, not whoever holds the link.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (!body.token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const sb = serviceClient();
  const { data: invite } = await sb
    .from('organization_invitations')
    .select('id, organization_id, email, role, status, expires_at, invited_by')
    .eq('token', body.token)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  if (invite.status !== 'pending') return NextResponse.json({ error: `Invitation already ${invite.status}` }, { status: 409 });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await sb.from('organization_invitations').update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });
  }
  if ((user.email ?? '').toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json(
      { error: `This invitation is for ${invite.email}. Sign in with that email to accept.` },
      { status: 403 },
    );
  }

  // Idempotent membership: upsert on (organization_id, user_id).
  const { error: memErr } = await sb
    .from('organization_members')
    .upsert(
      { organization_id: invite.organization_id, user_id: user.id, role: invite.role, invited_by: invite.invited_by },
      { onConflict: 'organization_id,user_id', ignoreDuplicates: true },
    );
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

  await sb
    .from('organization_invitations')
    .update({ status: 'accepted', accepted_by: user.id, accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  const { data: org } = await sb.from('organizations').select('slug, name').eq('id', invite.organization_id).maybeSingle();
  return NextResponse.json({ ok: true, org });
}
