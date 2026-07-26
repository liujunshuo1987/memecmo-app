// Operator digest tooling — configure, preview, and test-send client digests
// without waiting for the Tuesday cron. Admin-gated (org / parent / root).
//
//   GET  ?projectId=&preview=1        → render the digest HTML (dry run, no send)
//   POST { projectId, action }        → action: 'send'   — send now to configured recipients
//                                     → action: 'config' — set reportSchedule fields:
//                                       { recipients?, language?, kickoffAt?, stageOverride? }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAdminOrg } from '@/lib/org-auth';
import { sendProjectDigest, previewProjectDigest, type ReportSchedule } from '@/lib/reports/digest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // LLM interpretation section can take ~30-60s

async function authorize(projectId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const svc = serviceClient();
  const { data: project } = await svc
    .from('projects')
    .select('id, metadata, organization_id, organizations!inner(id, parent_org_id)')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  const org: any = project.organizations;
  if (!(await canAdminOrg(supabase, user.id, { id: org.id, parent_org_id: org.parent_org_id }))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { svc, project };
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const auth = await authorize(projectId);
  if ('error' in auth) return auth.error;
  const preview = await previewProjectDigest(auth.svc, projectId);
  if (!preview) return NextResponse.json({ error: 'Could not compose digest' }, { status: 500 });
  // Render the email HTML directly so the operator sees exactly what ships.
  return new NextResponse(preview.html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Digest-Stage': preview.stage,
      'X-Digest-Subject': encodeURIComponent(preview.subject),
    },
  });
}

export async function POST(req: NextRequest) {
  let body: { projectId?: string; action?: string; recipients?: string[]; language?: string; kickoffAt?: string; stageOverride?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (!body.projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

  const auth = await authorize(body.projectId);
  if ('error' in auth) return auth.error;
  const { svc, project } = auth;

  if (body.action === 'config') {
    const prev: ReportSchedule = (project.metadata as any)?.reportSchedule || {};
    const next: ReportSchedule = { ...prev };
    if (Array.isArray(body.recipients)) next.recipients = body.recipients.filter((r) => /.+@.+\..+/.test(String(r)));
    if (body.language && ['zh', 'en', 'vi'].includes(body.language)) next.language = body.language as any;
    if (body.kickoffAt) next.kickoffAt = body.kickoffAt;
    if (body.stageOverride === null) delete next.stageOverride;
    else if (body.stageOverride && ['build', 'optimize', 'steady'].includes(body.stageOverride)) next.stageOverride = body.stageOverride as any;
    const metadata = { ...(project.metadata as any), reportSchedule: next };
    const { error } = await svc.from('projects').update({ metadata }).eq('id', project.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, reportSchedule: next });
  }

  if (body.action === 'send') {
    const res = await sendProjectDigest(svc, project.id);
    return NextResponse.json(res, { status: res.sent ? 200 : 422 });
  }

  return NextResponse.json({ error: 'Unknown action (use "config" or "send")' }, { status: 400 });
}
