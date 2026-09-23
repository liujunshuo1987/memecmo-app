// Intervention log — what the client put into the world, and (computed) what
// the engines did afterwards. lib/interventions.ts, table interventions.
//
// GET    ?projectId=[&sourceRunId=][&withOutcomes=1]
// POST   { projectId, kind, url?, publishedAt, title?, note?, targetPrompts?: string[], sourceRunId?, sourceAssetType? }
// DELETE ?projectId=&id=          (marks removed; history is never deleted)
//
// Authorisation mirrors edits/project-sets: the caller must administer the
// project's org. Service client after that check.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAdminOrg } from '@/lib/org-auth';
import { unitHash } from '@/lib/edits';
import { INTERVENTION_KINDS, computeOutcomes, domainOf, loadInterventions, citedAfterMap } from '@/lib/interventions';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authorize(projectId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const svc = serviceClient();
  const { data: project } = await svc.from('projects').select('id, organizations(id, parent_org_id)').eq('id', projectId).maybeSingle();
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  const org: any = (project as any).organizations;
  if (!(await canAdminOrg(supabase, user.id, { id: org.id, parent_org_id: org.parent_org_id }))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { svc, user };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const projectId = q.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const a = await authorize(projectId);
  if ('error' in a) return a.error;
  const list = await loadInterventions(a.svc, projectId, { sourceRunId: q.get('sourceRunId') ?? undefined });
  const withOutcomes = q.get('withOutcomes') === '1';
  const [outcomes, citedAfter] = withOutcomes
    ? await Promise.all([computeOutcomes(a.svc, projectId, list), citedAfterMap(a.svc, projectId, list)])
    : [{}, {}];
  return NextResponse.json({ interventions: list, outcomes, citedAfter });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const { projectId, kind, url, publishedAt, title, note, sourceRunId, sourceAssetType } = body ?? {};
  if (!projectId || !kind || !publishedAt) return NextResponse.json({ error: 'Missing projectId, kind or publishedAt' }, { status: 400 });
  if (!(INTERVENTION_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(publishedAt))) return NextResponse.json({ error: 'publishedAt must be YYYY-MM-DD' }, { status: 400 });
  if (url && !domainOf(String(url))) return NextResponse.json({ error: 'url is not a valid URL' }, { status: 400 });
  const targets = Array.isArray(body.targetPrompts)
    ? body.targetPrompts.filter((p: unknown) => typeof p === 'string' && p.trim()).slice(0, 20).map((p: string) => ({ hash: unitHash(p), prompt: p.trim() }))
    : [];
  const a = await authorize(projectId);
  if ('error' in a) return a.error;
  const { data, error } = await a.svc
    .from('interventions')
    .insert({
      project_id: projectId, kind, url: url || null, domain: domainOf(url), title: title || null, note: note || null,
      target_prompts: targets, source_asset_type: sourceAssetType || null, source_run_id: sourceRunId || null,
      published_at: publishedAt, logged_by: a.user.id,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Phase 2: verify the page right away (live? words? hash) — best effort.
  if (data?.id && data?.url) {
    try { await inngest.send({ name: 'geo/intervention.verify', data: { interventionId: data.id } }); } catch (e) { console.warn('[verify] enqueue failed:', e instanceof Error ? e.message : String(e)); }
  }
  return NextResponse.json({ ok: true, intervention: data });
}

export async function DELETE(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const projectId = q.get('projectId'), id = q.get('id');
  if (!projectId || !id) return NextResponse.json({ error: 'Missing projectId or id' }, { status: 400 });
  const a = await authorize(projectId);
  if ('error' in a) return a.error;
  const { error } = await a.svc.from('interventions').update({ status: 'removed' }).eq('project_id', projectId).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
