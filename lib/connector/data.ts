// Connector data layer — what the MCP tools read and write, scoped to the
// key's organization. Everything here goes through the service client AFTER
// the key has been verified, with an explicit organization filter on every
// query (a key is never a Supabase user, so RLS cannot do this for us).
//
// Scorecards are read through json-path selects so a tool call never drags
// rawSamples (the full answer texts) over the wire.

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadEdits, applyAnswerEdits, unitHash } from '@/lib/edits';
import { loadBrandProfile } from '@/lib/agents/run';
import {
  INTERVENTION_KINDS, computeOutcomes, citedAfterMap, describeOutcome, domainOf, loadInterventions,
  type Intervention, type InterventionKind,
} from '@/lib/interventions';
import { inngest } from '@/lib/inngest/client';

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.memecmo.ai';
export const STANDARD_NOTE =
  'Measured on a frozen prompt panel per market under the MemeCMO AI Visibility Measurement Standard (https://app.memecmo.ai/guide). Every rate carries its numerator and denominator; presence is per answer and not additive, share of voice sums to 100%.';

export interface OrgRef { id: string; slug: string; name: string }
export interface ProjectRef {
  id: string; slug: string; brand_name: string; brand_url: string | null;
  target_country: string; target_language: string | null; industry: string | null; status: string;
  organization_id: string;
}

export const workspaceUrl = (orgSlug: string, projectSlug?: string) =>
  projectSlug ? `${APP_URL}/workspace/${orgSlug}/${projectSlug}` : `${APP_URL}/dashboard`;

/** Every tool answer carries attribution and the way back into the workspace — the connector is a funnel, not a pipe. */
export function envelope(org: OrgRef, project: ProjectRef | null, data: Record<string, unknown>): Record<string, unknown> {
  return {
    source: 'MemeCMO',
    organization: org.name,
    ...(project ? { project: project.slug, brand: project.brand_name, market: project.target_country } : {}),
    workspace: workspaceUrl(org.slug, project?.slug),
    standard: STANDARD_NOTE,
    ...data,
  };
}

/** The organizations a key may see: its own plus its direct client organizations. */
async function scopedOrgs(sb: SupabaseClient, orgId: string): Promise<OrgRef[]> {
  const { data } = await sb
    .from('organizations')
    .select('id, slug, name')
    .or(`id.eq.${orgId},parent_org_id.eq.${orgId}`)
    .eq('status', 'active');
  return (data ?? []) as OrgRef[];
}

const PROJECT_COLS = 'id, slug, brand_name, brand_url, target_country, target_language, industry, status, organization_id';

export async function listProjects(sb: SupabaseClient, orgId: string): Promise<{ orgs: OrgRef[]; projects: (ProjectRef & { org: OrgRef; latestScan: { at: string; aigvr: number | null; presence: number | null } | null })[] }> {
  const orgs = await scopedOrgs(sb, orgId);
  if (!orgs.length) return { orgs, projects: [] };
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const { data: projects } = await sb
    .from('projects')
    .select(PROJECT_COLS)
    .in('organization_id', orgs.map((o) => o.id))
    .neq('status', 'archived')
    .order('created_at', { ascending: true })
    .limit(100);
  const list = (projects ?? []) as ProjectRef[];
  if (!list.length) return { orgs, projects: [] };
  // Latest comparable scan per project — json paths only (no rawSamples).
  const { data: runs } = await sb
    .from('agent_runs')
    .select('project_id, completed_at, s1:output->>aigvrScore, s2:output->scorecard->>aigvrScore, p1:output->dimensions->>presence, p2:output->scorecard->dimensions->>presence, x1:output->>partial, x2:output->scorecard->>partial')
    .in('project_id', list.map((p) => p.id))
    .in('agent_id', ['monitor', 'full_scan'])
    .eq('status', 'completed')
    .neq('trigger_method', 'diagnostic')
    .order('completed_at', { ascending: false })
    .limit(list.length * 4);
  const latest = new Map<string, { at: string; aigvr: number | null; presence: number | null }>();
  for (const r of (runs ?? []) as any[]) {
    if (latest.has(r.project_id)) continue;
    if (r.x1 === 'true' || r.x2 === 'true') continue;
    const aigvr = r.s2 ?? r.s1; const presence = r.p2 ?? r.p1;
    latest.set(r.project_id, { at: r.completed_at, aigvr: aigvr != null ? Number(aigvr) : null, presence: presence != null ? Number(presence) : null });
  }
  return {
    orgs,
    projects: list.map((p) => ({ ...p, org: byId.get(p.organization_id)!, latestScan: latest.get(p.id) ?? null })),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a project by slug or id, inside the key's scope. */
export async function resolveProject(sb: SupabaseClient, orgId: string, ref: string): Promise<{ project: ProjectRef; org: OrgRef } | null> {
  const orgs = await scopedOrgs(sb, orgId);
  if (!orgs.length) return null;
  const q = sb.from('projects').select(PROJECT_COLS).in('organization_id', orgs.map((o) => o.id)).limit(1);
  const { data } = UUID_RE.test(ref) ? await q.eq('id', ref) : await q.eq('slug', ref);
  const project = (data?.[0] ?? null) as ProjectRef | null;
  if (!project) return null;
  return { project, org: orgs.find((o) => o.id === project.organization_id)! };
}

// ── scorecard ───────────────────────────────────────────────────────────────
const SC_SELECT =
  'id, agent_id, completed_at, trigger_method, ' +
  'a1:output->>aigvrScore, a2:output->scorecard->>aigvrScore, ' +
  'd1:output->dimensions, d2:output->scorecard->dimensions, ' +
  't1:output->topOfMind, t2:output->scorecard->topOfMind, ' +
  'o1:output->metrics->overall, o2:output->scorecard->metrics->overall, ' +
  'e1:output->metrics->perEngine, e2:output->scorecard->metrics->perEngine, ' +
  'b1:output->competitorBenchmark, b2:output->scorecard->competitorBenchmark, ' +
  'r1:output->>brandRank, r2:output->scorecard->>brandRank, ' +
  'g1:output->gaps, g2:output->scorecard->gaps, ' +
  's1:output->sampled, s2:output->scorecard->sampled, ' +
  'n1:output->engines, n2:output->scorecard->engines, ' +
  'x1:output->>partial, x2:output->scorecard->>partial, ' +
  'c1:output->citations->>brandCitedCount, c2:output->scorecard->citations->>brandCitedCount';

export interface ScorecardSummary {
  runId: string; scannedAt: string; agent: string;
  aigvr: number | null; dimensions: Record<string, number> | null; topOfMind: Record<string, unknown> | null;
  overall: Record<string, unknown> | null; perEngine: unknown[]; benchmark: unknown[]; brandRank: number | null;
  sampled: Record<string, unknown> | null; engines: string[]; brandCitedAnswers: number | null;
  gaps: { stage: string; prompt: string; engine: string; competitorsPresent: string[] }[];
}

export async function latestScorecard(sb: SupabaseClient, projectId: string): Promise<ScorecardSummary | null> {
  const { data } = await sb
    .from('agent_runs')
    .select(SC_SELECT)
    .eq('project_id', projectId)
    .in('agent_id', ['monitor', 'full_scan'])
    .eq('status', 'completed')
    .neq('trigger_method', 'diagnostic')
    .order('completed_at', { ascending: false })
    .limit(4);
  const r = ((data ?? []) as any[]).find((x) => x.x1 !== 'true' && x.x2 !== 'true');
  if (!r) return null;
  const pick = <T,>(a: T | null | undefined, b: T | null | undefined): T | null => (a ?? b ?? null);
  const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
  const gaps = (pick(r.g2, r.g1) as any[] | null) ?? [];
  return {
    runId: r.id, scannedAt: r.completed_at, agent: r.agent_id,
    aigvr: num(pick(r.a2, r.a1)), dimensions: pick(r.d2, r.d1), topOfMind: pick(r.t2, r.t1),
    overall: pick(r.o2, r.o1), perEngine: (pick(r.e2, r.e1) as unknown[] | null) ?? [],
    benchmark: ((pick(r.b2, r.b1) as unknown[] | null) ?? []).slice(0, 12), brandRank: num(pick(r.r2, r.r1)),
    sampled: pick(r.s2, r.s1), engines: (pick(r.n2, r.n1) as string[] | null) ?? [], brandCitedAnswers: num(pick(r.c2, r.c1)),
    gaps: gaps.map((g) => ({ stage: g.stage, prompt: g.prompt, engine: g.engine, competitorsPresent: g.competitorsPresent ?? [] })),
  };
}

// ── sources AI cites ────────────────────────────────────────────────────────
export async function sourcesRanking(sb: SupabaseClient, projectId: string, limit = 25) {
  const [rpc, total] = await Promise.all([
    sb.rpc('geo_citation_ranking', { p_project_id: projectId, p_limit: Math.max(1, Math.min(limit, 100)) }),
    sb.from('geo_citations').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ]);
  if (rpc.error) throw new Error(rpc.error.message);
  const ranking = ((rpc.data ?? []) as { domain: string; citations: number | string; answers: number | string; engines: number | string; is_brand: boolean }[])
    .map((r, i) => ({ rank: i + 1, domain: r.domain, citations: Number(r.citations), answers: Number(r.answers), engines: Number(r.engines), brandOwned: !!r.is_brand }));
  return { ranking, totalCitations: total.count ?? 0 };
}

// ── deliverables ────────────────────────────────────────────────────────────
export const DELIVERABLE_TYPES = ['content_draft', 'distribution_kit', 'site_optimization', 'encyclopedia_entry', 'geo_report', 'standard_answers', 'brand_profile', 'prompt_set'] as const;
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number];
const DOC_TYPES = new Set(['content_draft', 'distribution_kit', 'site_optimization', 'encyclopedia_entry']);

export async function listDeliverables(sb: SupabaseClient, projectId: string) {
  const { data } = await sb
    .from('assets')
    .select('id, type, title, format, agent_run_id, created_at, content')
    .eq('project_id', projectId)
    .in('type', DELIVERABLE_TYPES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(60);
  const seen = new Set<string>();
  const out: { type: string; title: string; format: string; runId: string | null; createdAt: string; words: number }[] = [];
  for (const a of (data ?? []) as any[]) {
    if (seen.has(a.type)) continue;
    seen.add(a.type);
    out.push({ type: a.type, title: a.title, format: a.format, runId: a.agent_run_id, createdAt: a.created_at, words: String(a.content ?? '').split(/\s+/).filter(Boolean).length });
  }
  return out;
}

/** The latest deliverable of one type, with the client's own edits applied last (a re-run never overwrites them). */
export async function getDeliverable(sb: SupabaseClient, projectId: string, type: DeliverableType) {
  if (type === 'brand_profile') {
    const profile = await loadBrandProfile(sb as any, projectId);
    return profile ? { type, format: 'json', content: profile } : null;
  }
  const { data } = await sb
    .from('assets')
    .select('id, type, title, format, agent_run_id, created_at, content')
    .eq('project_id', projectId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const a = data as any;
  let content: unknown = a.content;
  let edited = false;
  if (type === 'standard_answers') {
    try {
      const parsed = JSON.parse(a.content ?? '{}');
      const answers = Array.isArray(parsed?.answers) ? parsed.answers : Array.isArray(parsed) ? parsed : [];
      const edits = await loadEdits(sb, projectId, 'standard_answers');
      content = { ...(Array.isArray(parsed) ? {} : parsed), answers: applyAnswerEdits(answers, edits) };
      edited = edits.length > 0;
    } catch { /* keep raw */ }
  } else if (DOC_TYPES.has(type) && a.agent_run_id) {
    const edits = await loadEdits(sb, projectId, type);
    const e = edits.find((x) => x.unit_key === `doc:${a.agent_run_id}`);
    if (e) {
      const v: any = e.value;
      content = typeof v === 'string' ? v : (v?.content ?? v?.text ?? v?.markdown ?? content);
      edited = true;
    }
  } else if (a.format === 'json' && typeof a.content === 'string') {
    try { content = JSON.parse(a.content); } catch { /* keep raw */ }
  }
  return { type, title: a.title, format: a.format, runId: a.agent_run_id, createdAt: a.created_at, edited, content };
}

// ── actions (interventions) ─────────────────────────────────────────────────
export async function listActions(sb: SupabaseClient, projectId: string) {
  const list = await loadInterventions(sb, projectId, { limit: 50 });
  const [outcomes, citedAfter] = await Promise.all([computeOutcomes(sb, projectId, list), citedAfterMap(sb, projectId, list)]);
  return list.map((iv) => ({
    id: iv.id, kind: iv.kind, url: iv.url, domain: iv.domain, title: iv.title, note: iv.note,
    publishedAt: iv.published_at, status: iv.status, targetPrompts: iv.target_prompts.map((t) => t.prompt),
    verification: iv.verified_at
      ? { checkedAt: iv.verified_at, live: !!iv.page_ok, httpStatus: iv.page_status, pageTitle: iv.page_title, words: iv.page_words, changedAt: iv.changed_at, error: iv.verify_error }
      : { checkedAt: null, live: null, pending: true },
    citedSince: citedAfter[iv.id] ?? null,
    outcome: outcomes[iv.id] ? describeOutcome(iv, outcomes[iv.id]) : 'No comparable scan after the publish date yet.',
  }));
}

export interface LogActionInput {
  kind: string; url?: string | null; publishedAt: string; title?: string | null; note?: string | null;
  targetPrompts?: string[]; sourceRunId?: string | null; sourceAssetType?: string | null;
}

export async function logAction(
  sb: SupabaseClient,
  project: ProjectRef,
  input: LogActionInput,
  who: { loggedBy: string | null; keyId: string },
): Promise<{ intervention: Intervention; duplicate: boolean; verificationQueued: boolean }> {
  if (!(INTERVENTION_KINDS as readonly string[]).includes(input.kind)) throw new Error(`kind must be one of ${INTERVENTION_KINDS.join(', ')}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.publishedAt)) throw new Error('published_at must be YYYY-MM-DD');
  if (Date.parse(input.publishedAt) > Date.now() + 2 * 86400e3) throw new Error('published_at cannot be in the future');
  const url = input.url?.trim() || null;
  if (url && !domainOf(url)) throw new Error('url is not a valid URL');
  if (!url && !input.title) throw new Error('give a url, or at least a title when there is no page');
  // Idempotent on (project, url): a retry from an automation never logs twice.
  if (url) {
    const existing = await loadInterventions(sb, project.id, { limit: 200 });
    const dup = existing.find((iv) => iv.status === 'live' && iv.url && iv.url.replace(/\/+$/, '') === url.replace(/\/+$/, ''));
    if (dup) return { intervention: dup, duplicate: true, verificationQueued: false };
  }
  const targets = (input.targetPrompts ?? []).filter((p) => typeof p === 'string' && p.trim()).slice(0, 20).map((p) => ({ hash: unitHash(p), prompt: p.trim() }));
  const { data, error } = await sb
    .from('interventions')
    .insert({
      project_id: project.id, kind: input.kind as InterventionKind, url, domain: domainOf(url), title: input.title || null, note: input.note || null,
      target_prompts: targets, source_asset_type: input.sourceAssetType || null, source_run_id: input.sourceRunId || null,
      published_at: input.publishedAt, logged_by: who.loggedBy, channel: 'connector', connector_key_id: who.keyId,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  let verificationQueued = false;
  if (data?.id && url) {
    try { await inngest.send({ name: 'geo/intervention.verify', data: { interventionId: data.id } }); verificationQueued = true; }
    catch (e) { console.warn('[connector] verify enqueue failed:', e instanceof Error ? e.message : String(e)); }
  }
  return { intervention: data as Intervention, duplicate: false, verificationQueued };
}
