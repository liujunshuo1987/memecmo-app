// POST /api/workspace/orgs/approve — MemeCMO (root admin) approves or rejects a
// pending end_client/channel_partner org. Body: { orgId, action: 'approve'|'reject' }.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { orgId?: string; action?: 'approve' | 'reject' };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (!body.orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  const status = body.action === 'reject' ? 'suspended' : 'active';

  // Caller must be an admin of the ROOT org.
  const { data: root } = await supabase.from('organizations').select('id').eq('type', 'root').maybeSingle();
  if (!root) return NextResponse.json({ error: 'Root org not found' }, { status: 500 });
  const { data: mem } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', root.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!mem || mem.role !== 'admin') {
    return NextResponse.json({ error: 'Only MemeCMO admins can approve organizations' }, { status: 403 });
  }

  const sb = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: org, error } = await sb.from('organizations').update({ status }).eq('id', body.orgId).select('id, slug, status').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, org });
}
