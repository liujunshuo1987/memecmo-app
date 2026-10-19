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
//        withPeople also adds `edited` { at, by } to a row someone has changed.
// GET    ?projectId=&meta=1       → { total, brandHosts, core, canEdit, editable } — what the panel's
//        quick-add needs before any row has loaded, and whether the caller may change rows
//        (canEdit) and a change can be recorded with its author (editable).
// POST   { projectId, kind, url?, publishedAt, title?, note?, targetPrompts?: string[], sourceRunId?, sourceAssetType?, ifNew? }
//        ifNew: a link the project has already logged is not logged again; the
//        answer is { ok, duplicate: true, intervention: <the earlier row> }.
// PATCH  { projectId, id, publishedAt?, url?, title?, note?, kind?, targetPrompts? }
//        Changes the named fields, checked as POST checks them; "" or null clears
//        url, title or note. Recorded first, with who and the old values
//        (lib/interventions recordEdit): no record, no change (503 while the
//        record's table does not exist). A new url is checked again
//        (geo/intervention.verify); one the project already has → 409 duplicate.
// DELETE ?projectId=&id=          (marks removed; history is never deleted; recorded like a change once that can be)
//
// Authorisation: any member of the project's org may read (GET); writes need
// admin or editor (canEditOrg), so the client operating team logs its own
// actions under its own name. Service client after that check.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAccessOrg, canEditOrg } from '@/lib/org-auth';
import { unitHash } from '@/lib/edits';
import { EDIT_TRAIL, INTERVENTION_KINDS, breaksAffecting, computeOutcomesAndBreaks, countInterventions, diffAction, domainOf, editTrailReady, lastEdits, loadInterventions, peopleOf, recordEdit, citedAfterMap, type Intervention, type LastEdit } from '@/lib/interventions';
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
  return { svc, supabase, user, scope, orgId: org.id as string, project: project as { brand_url?: string | null; metadata?: any } };
}

interface Fields { kind?: string; publishedAt?: string; url?: string | null; title?: string | null; note?: string | null; targets?: { hash: string; prompt: string }[] }
/** An action's fields as a POST or PATCH body gives them, checked the same way
 *  for both. A field the body leaves out stays out (a PATCH changes only what it names). */
function checkFields(body: any): Fields | { error: string } {
  const out: Fields = {};
  if (body.kind !== undefined) {
    if (!(INTERVENTION_KINDS as readonly string[]).includes(body.kind)) return { error: 'Unknown kind' };
    out.kind = body.kind;
  }
  if (body.publishedAt !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.publishedAt))) return { error: 'publishedAt must be YYYY-MM-DD' };
    out.publishedAt = String(body.publishedAt);
  }
  if (body.url !== undefined) {
    const url = body.url == null ? '' : String(body.url).trim();
    if (url && !domainOf(url)) return { error: 'url is not a valid URL' };
    out.url = url || null;
  }
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() || null : null);
  if (body.title !== undefined) out.title = text(body.title);
  if (body.note !== undefined) out.note = text(body.note);
  if (body.targetPrompts !== undefined) {
    out.targets = Array.isArray(body.targetPrompts)
      ? body.targetPrompts.filter((p: unknown) => typeof p === 'string' && p.trim()).slice(0, 20).map((p: string) => ({ hash: unitHash(p), prompt: p.trim() }))
      : [];
  }
  return out;
}

/** The same link under another spelling (scheme, www, trailing slash, tracking parameters), logged live in the project — but not the row `except`. */
async function sameLink(svc: any, projectId: string, url: string, except?: string): Promise<Intervention | null> {
  const key = normUrl(url);
  if (!key) return null;
  let q = svc.from('interventions').select('*').eq('project_id', projectId).eq('status', 'live').eq('domain', domainOf(url)).order('created_at', { ascending: true });
  if (except) q = q.neq('id', except);
  const { data } = await q;
  return (data ?? []).find((iv: any) => normUrl(iv.url) === key) ?? null;
}

// What the page check knows describes the old page once the link changes.
const UNCHECKED = { verified_at: null, page_ok: null, page_status: null, page_title: null, page_words: null, text_hash: null, changed_at: null, verify_error: null };

async function verifySoon(id: string) {
  try { await inngest.send({ name: 'geo/intervention.verify', data: { interventionId: id } }); } catch (e) { console.warn('[verify] enqueue failed:', e instanceof Error ? e.message : String(e)); }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const projectId = q.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const a = await authorize(projectId, 'read');
  if ('error' in a) return a.error;
  if (q.get('meta') === '1') {
    const core = Array.isArray(a.project.metadata?.coreKeyPrompts) ? a.project.metadata.coreKeyPrompts.filter((p: unknown) => typeof p === 'string') : [];
    const [total, canEdit, editable] = await Promise.all([countInterventions(a.svc, projectId), canEditOrg(a.supabase, a.user.id, a.scope), editTrailReady(a.svc)]);
    return NextResponse.json({ total, brandHosts: brandHostsOf(a.project), core, canEdit, editable });
  }
  const sourceRunId = q.get('sourceRunId') ?? undefined;
  const limit = Math.min(100, Math.max(1, Math.floor(Number(q.get('limit'))) || 50));
  const offset = Math.max(0, Math.floor(Number(q.get('offset'))) || 0);
  const list = await loadInterventions(a.svc, projectId, { sourceRunId, limit, offset });
  const withOutcomes = q.get('withOutcomes') === '1';
  const withPeople = q.get('withPeople') === '1';
  const [measured, citedAfter, edits, total] = await Promise.all([
    withOutcomes ? computeOutcomesAndBreaks(a.svc, projectId, list) : { outcomes: {}, breaks: [] },
    withOutcomes ? citedAfterMap(a.svc, projectId, list) : {},
    withPeople ? lastEdits(a.svc, list.map((iv) => iv.id)) : ({} as Record<string, LastEdit>),
    // The count is of the whole project; a per-run lookup has no use for it.
    sourceRunId ? null : countInterventions(a.svc, projectId),
  ]);
  const people = withPeople ? await peopleOf(a.svc, a.orgId, [...list.map((iv) => iv.logged_by), ...Object.values(edits).map((e) => e.by)]) : null;
  const interventions = people
    ? list.map((iv) => {
      const e = edits[iv.id];
      return { ...iv, logger: iv.logged_by ? people[iv.logged_by] ?? null : null, ...(e ? { edited: { at: e.at, by: e.by ? people[e.by] ?? null : null } } : {}) };
    })
    : list;
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
  const { projectId, kind, publishedAt, sourceRunId, sourceAssetType } = body ?? {};
  if (!projectId || !kind || !publishedAt) return NextResponse.json({ error: 'Missing projectId, kind or publishedAt' }, { status: 400 });
  const f = checkFields(body);
  if ('error' in f) return NextResponse.json({ error: f.error }, { status: 400 });
  const url = f.url ?? null;
  const a = await authorize(projectId, 'write');
  if ('error' in a) return a.error;
  if (body.ifNew && url) {
    const earlier = await sameLink(a.svc, projectId, url);
    if (earlier) return NextResponse.json({ ok: true, duplicate: true, intervention: earlier });
  }
  const { data, error } = await a.svc
    .from('interventions')
    .insert({
      project_id: projectId, kind, url, domain: domainOf(url), title: f.title ?? null, note: f.note ?? null,
      target_prompts: f.targets ?? [], source_asset_type: sourceAssetType || null, source_run_id: sourceRunId || null,
      published_at: publishedAt, logged_by: a.user.id,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Phase 2: verify the page right away (live? words? hash) — best effort.
  if (data?.id && data?.url) await verifySoon(data.id);
  return NextResponse.json({ ok: true, intervention: data });
}

export async function PATCH(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const { projectId, id } = body ?? {};
  if (!projectId || !id) return NextResponse.json({ error: 'Missing projectId or id' }, { status: 400 });
  const f = checkFields(body);
  if ('error' in f) return NextResponse.json({ error: f.error }, { status: 400 });
  const a = await authorize(projectId, 'write');
  if ('error' in a) return a.error;
  // A change is made only where it can be recorded with who made it and what it replaced.
  if (!(await editTrailReady(a.svc))) return NextResponse.json({ error: 'Changes cannot be recorded yet, so actions cannot be edited.', code: 'no-trail' }, { status: 503 });
  const { data: row } = await a.svc.from('interventions').select('*').eq('project_id', projectId).eq('id', id).maybeSingle();
  if (!row || row.status !== 'live') return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  const changes = diffAction(row, { kind: f.kind as Intervention['kind'] | undefined, url: f.url, title: f.title, note: f.note, published_at: f.publishedAt, target_prompts: f.targets });
  if (!Object.keys(changes).length) return NextResponse.json({ ok: true, unchanged: true, intervention: row });
  const newUrl = 'url' in changes ? (changes.url.to as string | null) : undefined;
  if (newUrl) {
    const earlier = await sameLink(a.svc, projectId, newUrl, id);
    if (earlier) return NextResponse.json({ error: 'duplicate', duplicate: earlier }, { status: 409 });
  }
  const patch: Record<string, unknown> = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to]));
  if (newUrl !== undefined) Object.assign(patch, { domain: domainOf(newUrl), ...UNCHECKED });
  const record = await recordEdit(a.svc, { interventionId: id, projectId, action: 'edit', changes, userId: a.user.id });
  if (!record) return NextResponse.json({ error: 'The change could not be recorded, so it was not made.' }, { status: 500 });
  const { data, error } = await a.svc.from('interventions').update(patch).eq('project_id', projectId).eq('id', id).eq('status', 'live').select('*').single();
  if (error || !data) {
    // Not made after all: the record of it goes too.
    await a.svc.from(EDIT_TRAIL).delete().eq('id', record);
    return NextResponse.json({ error: error?.message ?? 'Action not found' }, { status: 500 });
  }
  if (newUrl) await verifySoon(id);
  return NextResponse.json({ ok: true, intervention: data, changed: Object.keys(changes) });
}

export async function DELETE(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const projectId = q.get('projectId'), id = q.get('id');
  if (!projectId || !id) return NextResponse.json({ error: 'Missing projectId or id' }, { status: 400 });
  const a = await authorize(projectId, 'write');
  if ('error' in a) return a.error;
  const { data: row } = await a.svc.from('interventions').select('id, status').eq('project_id', projectId).eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  if (row.status === 'removed') return NextResponse.json({ ok: true });
  // Who removed it and when, wherever that can be recorded. Where it cannot (no
  // table yet), removal works as it always has; the panel offers it only once it can.
  let record: string | null = null;
  if (await editTrailReady(a.svc)) {
    record = await recordEdit(a.svc, { interventionId: id, projectId, action: 'remove', changes: { status: { from: 'live', to: 'removed' } }, userId: a.user.id });
    if (!record) return NextResponse.json({ error: 'The removal could not be recorded, so it was not made.' }, { status: 500 });
  }
  const { error } = await a.svc.from('interventions').update({ status: 'removed' }).eq('project_id', projectId).eq('id', id);
  if (error) {
    if (record) await a.svc.from(EDIT_TRAIL).delete().eq('id', record);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
