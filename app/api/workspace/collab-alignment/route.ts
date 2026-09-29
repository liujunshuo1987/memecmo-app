// GET /api/workspace/collab-alignment?projectId=&days=28   (or &from=&to= YYYY-MM-DD)
//
// Collaboration alignment for one project over a period (lib/collab-alignment):
// cosine between the client team's own attributed updates and the measured
// gaps on the locked Core 20 questions, clipped at 0; null when the team made
// no directional update in the period. Any org member may read.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAccessOrg } from '@/lib/org-auth';
import { loadCollabAlignment } from '@/lib/collab-alignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const projectId = q.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = serviceClient();
  const { data: project } = await svc.from('projects').select('id, organizations(id, parent_org_id)').eq('id', projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const org: any = (project as any).organizations;
  if (!(await canAccessOrg(supabase, user.id, { id: org.id, parent_org_id: org.parent_org_id }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const day = /^\d{4}-\d{2}-\d{2}$/;
  let from: Date;
  let to: Date;
  if (day.test(q.get('from') ?? '') && day.test(q.get('to') ?? '')) {
    from = new Date(`${q.get('from')}T00:00:00Z`);
    to = new Date(`${q.get('to')}T23:59:59Z`);
  } else {
    const days = Math.min(Math.max(Number(q.get('days')) || 28, 7), 120);
    to = new Date();
    from = new Date(to.getTime() - days * 86400e3);
  }
  const result = await loadCollabAlignment(svc, projectId, from, to);
  return NextResponse.json(result);
}
