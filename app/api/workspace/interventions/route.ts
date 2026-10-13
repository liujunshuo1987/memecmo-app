// Intervention log — what the client put into the world, and (computed) what
// the engines did afterwards. lib/interventions.ts, table interventions.
//
// GET    ?projectId=[&sourceRunId=][&withOutcomes=1][&withPeople=1][&limit=&offset=]
//        One page (50 rows unless asked, 100 at most), newest publish date
//        first. `total` is the project's whole count of live actions, so a
//        reader can tell a page from the ledger and ask for the rest.
//        withPeople adds `logger` to each row: who logged it, for display.
//        With outcomes, an outcome whose site-citation counts straddle an
//        engine's change in how many sources it lists carries `sourceBreaks`.
// GET    ?projectId=&meta=1       → { total, brandHosts, core } — what the panel's quick-add needs before any row has loaded
// POST   { projectId, kind, url?, publishedAt, title?, note?, targetPrompts?: string[], sourceRunId?, sourceAssetType?, ifNew? }
//        ifNew: a link the project has already logged is not logged again; the
//        answer is { ok, duplicate: true, intervention: <the earlier row> }.
// DELETE ?projectId=&id=          (marks removed; history is never deleted)
//
// Authorisation: any member of the project's org may read (GET); writes need
// admin or editor (canEditOrg), so the client operating team logs its own
// actions under its own name. Service client after that check.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAccessOrg, canEditOrg } from '@/lib/org-auth';
import { unitHash } from '@/lib/edits';
import { INTERVENTION_KINDS, breaksAffecting, computeOutcomesAndBreaks, countInterventions, domainOf, loadInterventions, loggersOf, citedAfterMap } from '@/lib/interventions';
import { brandHostsOf } from '@/lib/action-input';
import { normUrl } from '@/lib/suggestions';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authorize(projectId: string, mode: 'read' | 'write') {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const svc = serviceClient();
  const { data: project } = await svc.from('projects').select('id, brand_url, metadata, organizations(id, parent_org_id)').eq('id', projectId).maybeSingle();
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  const org: any = (project as any).organizations;
  const scope = { id: org.id, parent_org_id: org.parent_org_id };
  const allowed = mode === 'write' ? await canEditOrg(supabase, user.id, scope) : await canAccessOrg(supabase, user.id, scope);
  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { svc, user, orgId: org.id as string, project: project as { brand_url?: string | null; metadata?: any } };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const projectId = q.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const a = await authorize(projectId, 'read');
  if ('error' in a) return a.error;
  if (q.get('meta') === '1') {
    const core = Array.isArray(a.project.metadata?.coreKeyPrompts) ? a.project.metadata.coreKeyPrompts.filter((p: unknown) => typeof p === 'string') : [];
    return NextResponse.json({ total: await countInterventions(a.svc, projectId), brandHosts: brandHostsOf(a.project), core });
  }
  const sourceRunId = q.get('sourceRunId') ?? undefined;
  const limit = Math.min(100, Math.max(1, Math.floor(Number(q.get('limit'))) || 50));
  const offset = Math.max(0, Math.floor(Number(q.get('offset'))) || 0);
  const list = await loadInterventions(a.svc, projectId, { sourceRunId, limit, offset });
  const withOutcomes = q.get('withOutcomes') === '1';
  const [measured, citedAfter, people, total] = await Promise.all([
    withOutcomes ? computeOutcomesAndBreaks(a.svc, projectId, list) : { outcomes: {}, breaks: [] },
    withOutcomes ? citedAfterMap(a.svc, projectId, list) : {},
    q.get('withPeople') === '1' ? loggersOf(a.svc, a.orgId, list) : null,
    // The count is of the whole project; a per-run lookup has no use for it.
    sourceRunId ? null : countInterventions(a.svc, projectId),
  ]);
  const interventions = people ? list.map((iv) => ({ ...iv, logger: iv.logged_by ? people[iv.logged_by] ?? null : null })) : list;
  // The figures are untouched; an outcome only learns which engine-side changes its site line straddles.
  const outcomes = measured.outcomes;
  for (const o of Object.values(outcomes)) {
    const breaks = breaksAffecting(o, measured.breaks);
    if (breaks.length) o.sourceBreaks = breaks;
  }
  return NextResponse.json({ interventions, outcomes, citedAfter, total, breaks: measured.breaks });
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
  const a = await authorize(projectId, 'write');
  if ('error' in a) return a.error;
  if (body.ifNew && url) {
    // Same page under another spelling (scheme, www, trailing slash, tracking parameters) is the same link.
    const key = normUrl(String(url));
    const { data: sameSite } = await a.svc.from('interventions').select('*').eq('project_id', projectId).eq('status', 'live').eq('domain', domainOf(url)).order('created_at', { ascending: true });
    const earlier = (sameSite ?? []).find((iv: any) => key && normUrl(iv.url) === key);
    if (earlier) return NextResponse.json({ ok: true, duplicate: true, intervention: earlier });
  }
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
  const a = await authorize(projectId, 'write');
  if ('error' in a) return a.error;
  const { error } = await a.svc.from('interventions').update({ status: 'removed' }).eq('project_id', projectId).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
