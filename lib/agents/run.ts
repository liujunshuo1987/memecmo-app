// Agent dispatcher — runs an agent for a given run row, emitting events
// through whatever emitter is supplied, and finalizes the run + assets.
//
// Designed to be invoked from the SSE stream endpoint: that endpoint is a
// long-lived streaming response, so the serverless function stays alive for
// the agent's full duration (unlike a fire-and-forget after an HTTP return,
// which Vercel freezes immediately).

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { loadCitationProfile, citationBrief } from '@/lib/pages/profile';
import { inngest } from '@/lib/inngest/client';
import { deliverableLanguageFor, promptLanguageFor } from '@/lib/markets';
import { createHash } from 'node:crypto';
import { AGENTS } from './registry';
import { runDiscoveryAgent } from './discovery';
import { runMonitorAgent } from './monitor';
import { runReportAgent } from './report';
import { runOptimizeAgent } from './optimize';
import { runDistributeAgent } from './distribute';
import { runSiteAgent } from './site';
import { runEncyclopediaAgent } from './encyclopedia';
import { runProfileAgent } from './profile';
import { runStandardAnswersAgent } from './answers';
import { planPolicyForProject } from '@/lib/commerce';
import { refundFailedRun } from '@/lib/credits';
import { NonRetriableError } from 'inngest';
import { poeChat, DEFAULT_MODEL, isCapacityError, isNonRetriable, runMeter, newMeter, type UsageMeter } from '@/lib/llm/poe';
import { resolveEngineModels } from '@/lib/agents/monitor';
import { notifyOperator } from '@/lib/alerts';
import { loadEdits, applyProfileEdits, applyAnswerEdits, unitHash } from '@/lib/edits';

// Latest standard-answers library (B2) → the canonical answers the accuracy
// pass judges real AI answers against. Null when the library hasn't been built.
async function loadStandardAnswers(sb: any, projectId: string): Promise<{ prompt: string; local?: string; en?: string }[] | undefined> {
  const { data } = await sb
    .from('assets')
    .select('content')
    .eq('project_id', projectId)
    .eq('type', 'standard_answers')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.content) return undefined;
  try {
    const parsed = JSON.parse(data.content);
    const answers = (parsed?.answers || []).filter((a: any) => a?.prompt);
    // The user's edits win over whatever the latest generation produced —
    // this is the yardstick the accuracy judge measures AI answers against.
    const merged = applyAnswerEdits(answers, await loadEdits(sb, projectId, 'standard_answers'));
    return merged.length ? merged : undefined;
  } catch { return undefined; }
}

// Load the latest canonical brand profile (if any) so execution agents share
// consistent facts. Returns null when none exists yet.
async function loadBrandProfile(sb: ReturnType<typeof svc>, projectId: string): Promise<any | null> {
  const { data } = await sb
    .from('assets')
    .select('content')
    .eq('project_id', projectId)
    .eq('type', 'brand_profile')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let profile: any = null;
  if (data?.content) {
    try { profile = JSON.parse(data.content); } catch { /* corrupted → docs-only below */ }
  }
  // User-edited fields are applied last, so a Profile re-run (which inserts a
  // newer asset) can never replace a fact a human corrected. Every execution
  // agent grounds on this merged profile.
  profile = applyProfileEdits(profile, await loadEdits(sb, projectId, 'brand_profile'));

  // Uploaded brand documents (guidelines / positioning) join the grounding —
  // budgeted excerpt so several docs fit without blowing the prompt.
  const { data: docs } = await sb
    .from('assets')
    .select('title, content')
    .eq('project_id', projectId)
    .eq('type', 'brand_doc')
    .order('created_at', { ascending: false })
    .limit(5);
  if (docs?.length) {
    const BUDGET = 4000;
    const per = Math.floor(BUDGET / docs.length);
    const uploadedDocs = docs
      .map((d) => `[${d.title}]\n${(d.content || '').slice(0, per)}`)
      .join('\n---\n');
    profile = { ...(profile || {}), uploadedDocs };
  }
  return profile;
}

export type AgentEvent = {
  event_type:
    | 'log'
    | 'tool_call'
    | 'tool_result'
    | 'progress'
    | 'output_chunk'
    | 'error'
    | 'milestone';
  payload: Record<string, unknown>;
};

export type Emitter = (event: AgentEvent) => Promise<void>;

interface ProjectLite {
  id: string;
  brand_name: string;
  brand_url: string | null;
  target_country: string;
  target_language: string | null;
  industry: string | null;
}

// Deliverable (report) language: projects.metadata.reportLanguage → market
// default (lib/markets.ts) → target_language. Distinct from the PROMPT
// language on purpose: a Hong Kong client reads Traditional Chinese even when
// the panel was built in Simplified; changing the panel is a methodology
// change (standard §11), changing the report language is not.
async function loadDeliverableLanguage(sb: ReturnType<typeof svc>, project: ProjectLite): Promise<string> {
  const { data } = await sb.from('projects').select('metadata').eq('id', project.id).maybeSingle();
  return deliverableLanguageFor({ ...project, metadata: (data?.metadata as Record<string, any>) ?? null });
}

// After the citation index grows, read the newly cited pages (lib/pages).
// Best-effort: a failed enqueue never fails the scan; the nightly cron
// catches up.
async function queuePageFetch(projectId: string, runId: string): Promise<void> {
  try { await inngest.send({ name: 'geo/pages.fetch', data: { projectId, runId, limit: 150 } }); }
  catch (e) { console.warn('[pages] enqueue failed:', e instanceof Error ? e.message : String(e)); }
}

// Phase 2 of the cited-page fetcher: a measured "what gets cited here" brief
// for the content/site/report agents, and the client's own read pages as the
// report's fact corpus. Both best-effort — an empty brief is a valid brief.
async function loadCitationBriefSafe(sb: ReturnType<typeof svc>, projectId: string): Promise<string> {
  try { return citationBrief(await loadCitationProfile(sb, projectId)); } catch (e) { console.warn('[pages] brief unavailable:', e instanceof Error ? e.message : String(e)); return ''; }
}
async function loadSiteCorpus(sb: ReturnType<typeof svc>, project: ProjectLite, limit = 40): Promise<{ url: string; title: string | null; excerpt: string | null; date: string | null; words: number | null }[]> {
  try {
    const brandDomains = await loadBrandDomains(sb, project);
    const [{ data: own }, { data: cited }] = await Promise.all([
      sb.from('project_pages').select('url').eq('project_id', project.id).limit(120),
      sb.from('geo_citations').select('url').eq('project_id', project.id).eq('is_brand_domain', true).order('ts', { ascending: false }).limit(300),
    ]);
    const urls = Array.from(new Set([...(own ?? []).map((r: any) => String(r.url)), ...(cited ?? []).map((r: any) => String(r.url))]))
      .filter((u) => { try { return brandDomains.size === 0 || brandDomains.has(new URL(u).hostname.replace(/^www\./, '').toLowerCase()); } catch { return false; } })
      .slice(0, 400);
    if (!urls.length) return [];
    const { data: pages } = await sb.from('geo_pages').select('url, title, excerpt, published_at, modified_at, word_count').in('url', urls).eq('ok', true).order('word_count', { ascending: false }).limit(limit);
    return (pages ?? []).map((p: any) => ({ url: p.url, title: p.title ?? null, excerpt: p.excerpt ?? null, date: (p.modified_at ?? p.published_at ?? null) && String(p.modified_at ?? p.published_at).slice(0, 10), words: p.word_count ?? null }));
  } catch (e) { console.warn('[pages] corpus unavailable:', e instanceof Error ? e.message : String(e)); return []; }
}

// Frozen competitor set (score stability) lives on projects.metadata.
async function loadCompetitorSet(sb: ReturnType<typeof svc>, projectId: string): Promise<any | null> {
  const { data } = await sb.from('projects').select('metadata').eq('id', projectId).maybeSingle();
  return (data?.metadata as any)?.competitorSet ?? null;
}

// Core Benchmark lock (meeting resolution 2026-08-06, FMVN): the 20 co-selected
// key prompts in projects.metadata.coreKeyPrompts are permanently frozen. While
// present they override the library's rotating key selection, and any of them
// missing from the (monthly-rotated) library is re-appended so the KPI panel
// never drifts. Changing the core list requires written sign-off from both sides.
async function loadCoreKeyPrompts(sb: ReturnType<typeof svc>, projectId: string): Promise<string[] | null> {
  const { data } = await sb.from('projects').select('metadata').eq('id', projectId).maybeSingle();
  const core = (data?.metadata as any)?.coreKeyPrompts;
  return Array.isArray(core) && core.length ? core : null;
}

function applyCoreLock(
  core: string[] | null,
  promptSet: PromptCat[],
  keyPrompts: string[],
): { promptSet: PromptCat[]; keyPrompts: string[] } {
  if (!core?.length) return { promptSet, keyPrompts };
  // Diacritic/space/punctuation-insensitive matching — exact-string matching
  // treated trivially different Vietnamese phrasings as "missing" and inflated
  // the panel 110→130 (client round-3 finding "panel 24/130").
  const normP = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[?？.!,\s]+/g, ' ').trim();
  const inSet = new Set(promptSet.flatMap((c) => c.prompts).map(normP));
  const missing = core.filter((p) => !inSet.has(normP(p)));
  const ps = missing.length
    ? [...promptSet, { category: 'core', label: 'Core benchmark (frozen)', prompts: missing }]
    : promptSet;
  return { promptSet: ps, keyPrompts: core };
}

// Operator prompt edits (projects.metadata.promptEdits {excluded[], added[],
// rewrites[]}). Applied at run assembly — the stored Discovery asset stays
// untouched, so edits are reversible and never corrupt the source library.
// `rewrites` is the FMVN localization loop (meeting 2026-09-23): the Vietnamese
// team rewords AI-generated prompts to match real local search phrasing; each
// pair {from, to} also doubles as labelled post-training data. Core-locked
// prompts are protected downstream by applyCoreLock (runs after this).
type PromptCat = { category: string; label: string; prompts: string[] };
// `added` entries carry the funnel category they belong to (stage-balanced
// sampling depends on it); bare strings are legacy and land in 'custom'.
type PromptEdits = {
  excluded?: string[];
  added?: (string | { text: string; category?: string })[];
  rewrites?: { from: string; to: string; note?: string }[];
};
async function loadPromptEdits(sb: ReturnType<typeof svc>, projectId: string): Promise<PromptEdits | null> {
  const { data } = await sb.from('projects').select('metadata').eq('id', projectId).maybeSingle();
  return (data?.metadata as any)?.promptEdits ?? null;
}
function applyPromptEdits(
  edits: PromptEdits | null,
  promptSet: PromptCat[],
  keyPrompts: string[],
): { promptSet: PromptCat[]; keyPrompts: string[] } {
  if (!edits) return { promptSet, keyPrompts };
  const norm = (s: string) => s.trim().toLowerCase();
  const rewrite = new Map<string, string>();
  for (const r of edits.rewrites ?? []) {
    const from = norm(String(r?.from ?? ''));
    const to = String(r?.to ?? '').trim();
    if (from && to && from !== norm(to)) rewrite.set(from, to);
  }
  const rw = (p: string) => rewrite.get(norm(p)) ?? p;
  // Exclusions match either the original or the reworded text, so a prompt
  // excluded before a rewrite stays excluded after it.
  const excluded = new Set((edits.excluded ?? []).map(norm));
  const drop = (p: string) => excluded.has(norm(p)) || excluded.has(norm(rw(p)));
  // Two originals can reword to the same text — keep the first occurrence so
  // the engines are never billed for a duplicate query.
  const seen = new Set<string>();
  const ps = promptSet
    .map((c) => ({
      ...c,
      prompts: (c.prompts || [])
        .filter((p) => !drop(p))
        .map(rw)
        .filter((p) => (seen.has(norm(p)) ? false : (seen.add(norm(p)), true))),
    }))
    .filter((c) => c.prompts.length);
  const kp = keyPrompts.filter((p) => !drop(p)).map(rw);
  // Added prompts join their chosen category (a category emptied by
  // exclusions is revived with its original label); unknown → 'custom'.
  const labelOf = new Map(promptSet.map((c) => [c.category, c.label]));
  for (const a of edits.added ?? []) {
    const text = (typeof a === 'string' ? a : String(a?.text ?? '')).trim();
    const category = (typeof a === 'string' ? '' : String(a?.category ?? '').trim()) || 'custom';
    if (!text || excluded.has(norm(text)) || seen.has(norm(text))) continue;
    seen.add(norm(text));
    let target = ps.find((c) => c.category === category);
    if (!target) {
      target = { category, label: labelOf.get(category) ?? 'Operator-added', prompts: [] };
      ps.push(target);
    }
    target.prompts.push(text);
  }
  return { promptSet: ps, keyPrompts: kp };
}
async function persistCompetitorSet(sb: ReturnType<typeof svc>, projectId: string, set: unknown): Promise<void> {
  const { data } = await sb.from('projects').select('metadata').eq('id', projectId).maybeSingle();
  const metadata = { ...((data?.metadata as Record<string, unknown>) || {}), competitorSet: set };
  await sb.from('projects').update({ metadata }).eq('id', projectId);
}

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

// Every domain that IS the brand. A brand often answers on more than one host
// (FMVN's corporate site is goldsunfocusmedia.com.vn, not focusmedia.vn) —
// counting those as third-party understates own-domain authority and, worse,
// would list the client's own site among its "third-party carriers".
// Extra hosts live on projects.metadata.brandDomains.
export function brandDomainSet(brandUrl: string | null | undefined, extra: unknown): Set<string> {
  const out = new Set<string>();
  const primary = domainOf(brandUrl || '');
  if (primary) out.add(primary);
  if (Array.isArray(extra)) {
    for (const d of extra) {
      const norm = String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      if (norm) out.add(norm);
    }
  }
  return out;
}

// Same loader pattern as the competitor set / core prompts: read the extra
// hosts off projects.metadata rather than requiring every caller to select it.
async function loadBrandDomains(sb: ReturnType<typeof svc>, project: ProjectLite): Promise<Set<string>> {
  const { data } = await sb.from('projects').select('metadata').eq('id', project.id).maybeSingle();
  return brandDomainSet(project.brand_url, (data?.metadata as { brandDomains?: unknown } | null)?.brandDomains);
}

// Persist this scan's citations to the Source-Authority Index and return the
// CROSS-SCAN ranking (which domains the engines cite most for this project,
// across all scans so far). The compounding GEO-native authority signal.
// Evidence-grade fields (corpus-leverage S1, 2026-09): every citation row now
// carries the CONTEXT it appeared in — which question intent, whether the
// brand won that answer, who else was present. prompt_hash groups citations
// by question without storing the question on every row.
export function promptHash(prompt: string | undefined | null): string | null {
  if (!prompt) return null;
  return createHash('sha256').update(String(prompt).trim().toLowerCase()).digest('hex').slice(0, 16);
}

async function recordCitationsAndIndex(
  sb: ReturnType<typeof svc>,
  projectId: string,
  agentRunId: string,
  brandDomains: Set<string>,
  rawSamples: { engine?: string; stage?: string; citations?: string[]; intent?: string; prompt?: string; brandPresent?: boolean; competitorsPresent?: string[] }[],
): Promise<{ ranking: { domain: string; citations: number; answers?: number; engines: number; isBrand: boolean }[]; totalCitations: number }> {
  const rows: Record<string, unknown>[] = [];
  for (const s of rawSamples || []) {
    for (const url of s.citations || []) {
      const dom = domainOf(url);
      if (!dom) continue;
      rows.push({
        project_id: projectId,
        agent_run_id: agentRunId,
        engine: s.engine ?? 'unknown',
        stage: s.stage ?? null,
        domain: dom,
        url,
        is_brand_domain: brandDomains.has(dom),
        intent: s.intent ?? null,
        prompt_hash: promptHash(s.prompt),
        brand_present: typeof s.brandPresent === 'boolean' ? s.brandPresent : null,
        competitors: Array.isArray(s.competitorsPresent) && s.competitorsPresent.length ? s.competitorsPresent : null,
      });
    }
  }
  if (rows.length) await sb.from('geo_citations').insert(rows);

  // Aggregate in SQL (20260923_citation_ranking). The per-row select below is
  // capped at 1000 rows by PostgREST, so once an index outgrew that (FMVN did
  // months ago) the ranking came from an arbitrary prefix — the dashboard
  // showed a domain cited 132× in one scan as 61× across all scans. The old
  // path stays only as a fallback for a deploy that precedes the migration.
  const [rpc, total] = await Promise.all([
    sb.rpc('geo_citation_ranking', { p_project_id: projectId, p_limit: 20 }),
    sb.from('geo_citations').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ]);
  if (!rpc.error && Array.isArray(rpc.data)) {
    const ranking = (rpc.data as { domain: string; citations: number | string; answers: number | string; engines: number | string; is_brand: boolean }[])
      .map((r) => ({ domain: r.domain, citations: Number(r.citations), answers: Number(r.answers), engines: Number(r.engines), isBrand: !!r.is_brand }));
    return { ranking, totalCitations: total.count ?? ranking.reduce((a, r) => a + r.citations, 0) };
  }
  console.warn('[source-index] geo_citation_ranking unavailable, using capped select:', rpc.error?.message);
  const { data } = await sb
    .from('geo_citations')
    .select('domain,engine,is_brand_domain')
    .eq('project_id', projectId);
  const map = new Map<string, { citations: number; engines: Set<string>; isBrand: boolean }>();
  for (const r of data || []) {
    const e = map.get(r.domain) || { citations: 0, engines: new Set<string>(), isBrand: false };
    e.citations++;
    e.engines.add(r.engine);
    e.isBrand = e.isBrand || r.is_brand_domain;
    map.set(r.domain, e);
  }
  const ranking = Array.from(map.entries())
    .map(([domain, e]) => ({ domain, citations: e.citations, engines: e.engines.size, isBrand: e.isBrand }))
    .sort((a, b) => b.citations - a.citations)
    .slice(0, 20);
  return { ranking, totalCitations: (data || []).length };
}

// Atomically claim a queued run (queued → running). Returns true if we won
// the claim (and should run the agent), false if someone else already did.
export async function claimRun(runId: string): Promise<boolean> {
  const sb = svc();
  const { data } = await sb
    .from('agent_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'queued')
    .select('id');
  return !!data && data.length > 0;
}

// Minimal shape of the Inngest `step` we use — passed through so long cascades
// checkpoint per phase (separate short invocations, durable resume). Loosely
// typed because Inngest's step.run returns Jsonify<T> (it serializes results);
// our agent outputs are plain JSON so the round-trip is lossless.
type StepRunner = { run: (id: string, fn: () => Promise<any>) => Promise<any> };

// Add a step's metered usage onto the run row. Steps execute sequentially
// within a run, so read-modify-write is safe here; the columns had existed
// unwritten since June.
async function addRunTokens(sb: ReturnType<typeof svc>, runId: string, m: UsageMeter): Promise<void> {
  if (!m.calls) return;
  try {
    const { data } = await sb.from('agent_runs').select('tokens_in, tokens_out, usage_by_model').eq('id', runId).maybeSingle();
    const merged: Record<string, { promptTokens: number; completionTokens: number; calls: number }> = { ...(data?.usage_by_model ?? {}) };
    for (const [model, u] of Object.entries(m.byModel)) {
      const prev = merged[model] ?? { promptTokens: 0, completionTokens: 0, calls: 0 };
      merged[model] = { promptTokens: prev.promptTokens + u.promptTokens, completionTokens: prev.completionTokens + u.completionTokens, calls: prev.calls + u.calls };
    }
    await sb
      .from('agent_runs')
      .update({
        tokens_in: Number(data?.tokens_in ?? 0) + m.promptTokens,
        tokens_out: Number(data?.tokens_out ?? 0) + m.completionTokens,
        usage_by_model: merged,
      })
      .eq('id', runId);
  } catch (e) {
    console.error('[run] token accounting failed:', e);
  }
}

// Deposit a comparable scan's judged answers (full text + machine labels) into
// golden_pool and strip them from the run output. Diagnostic, partial and
// preview scans are excluded: the golden set must mirror the distribution the
// judge is measured on in production.
async function persistGoldenPool(
  sb: ReturnType<typeof svc>,
  project: ProjectLite,
  runId: string,
  output: Record<string, unknown>,
  skip: boolean,
): Promise<number> {
  const rows = (output as any)._goldenCandidates;
  delete (output as any)._goldenCandidates;
  if (skip || !Array.isArray(rows) || !rows.length) return 0;
  const language = String(project.target_language || 'en').toLowerCase().split('-')[0];
  const models: Record<string, string> = (output as any).engineModels ?? {};
  const ins = rows
    .filter((r: any) => r?.text && r?.prompt)
    .map((r: any) => ({
      project_id: project.id, agent_run_id: runId, language, engine: r.engine, model: models[r.engine] ?? null,
      stage: r.stage ?? null, intent: r.intent ?? null, key_prompt: !!r.key, prompt: r.prompt, prompt_hash: unitHash(r.prompt) ?? '',
      answer_text: String(r.text).slice(0, 12000), brand_name: project.brand_name, competitor_names: r.tracked ?? [], machine: r.machine ?? {},
    }));
  let n = 0;
  for (let i = 0; i < ins.length; i += 60) {
    const { error } = await sb.from('golden_pool').upsert(ins.slice(i, i + 60), { onConflict: 'agent_run_id,engine,prompt_hash', ignoreDuplicates: true });
    if (error) { console.error('[golden] insert failed:', error.message); break; }
    n += Math.min(60, ins.length - i);
  }
  return n;
}

// Run the agent end-to-end: emit events, finalize status, persist assets.
export async function executeAgentRun(
  runId: string,
  agentId: string,
  project: ProjectLite,
  emit: Emitter,
  step?: StepRunner,
): Promise<void> {
  const sb = svc();

  // The user's typed instruction (intent box / chat) — steers Discovery.
  // Market default when the project has no explicit language (lib/markets.ts):
  // a Hong Kong project with target_language NULL builds a zh-hk panel, not an
  // English one. Explicit values are kept verbatim (never a silent panel change).
  project = { ...project, target_language: promptLanguageFor(project) };
  const { data: runRow } = await sb.from('agent_runs').select('input_prompt').eq('id', runId).maybeSingle();
  const userPrompt: string | undefined = runRow?.input_prompt || undefined;

  // step.run when running under Inngest, else a passthrough (direct call/test).
  // IMPORTANT: everything with a side effect inside a cascade must live INSIDE a
  // step — Inngest re-executes code OUTSIDE steps on every resume, which would
  // duplicate events/assets. A completed step is skipped (memoized) on resume.
  // Every step body runs under a token meter (persisted per step, so the
  // count survives Inngest's per-step invocations) and behind a capacity guard:
  // an EngineCapacityError is deterministic, so it leaves the step as a
  // NonRetriableError — the executor must not retry it. Before this, the same
  // 402 was retried three times per run, holding clients at 75% for minutes.
  const guarded = (fn: () => Promise<any>) => async () => {
    const meter = newMeter();
    try {
      return await runMeter.run(meter, fn);
    } catch (e) {
      if (isNonRetriable(e)) throw new NonRetriableError(e instanceof Error ? e.message : String(e), { cause: e });
      throw e;
    } finally {
      await addRunTokens(sb, runId, meter);
    }
  };
  const runStep: (id: string, fn: () => Promise<any>) => Promise<any> = step
    ? (id, fn) => step.run(id, guarded(fn))
    : (_id, fn) => guarded(fn)();

  // Combined emitter: persist to DB (for history/replay) + caller's emitter.
  const persistAndEmit: Emitter = async (event) => {
    await sb.from('agent_run_events').insert({
      agent_run_id: runId,
      event_type: event.event_type,
      payload: event.payload,
    });
    // Mirror progress events onto the run row so the UI progress bar moves
    // smoothly instead of jumping 0 → 100 at completion.
    if (event.event_type === 'progress' && typeof event.payload?.pct === 'number') {
      // Only while running: a straggling progress event from a parallel
      // engine branch used to land AFTER completion and overwrite 100 with
      // 33%, which reads as a partial scan in the UI.
      await sb.from('agent_runs').update({ progress_pct: event.payload.pct }).eq('id', runId).eq('status', 'running');
    }
    await emit(event);
  };

  // Phase-banded emitter for the cascade: remaps a sub-agent's 0-100 progress
  // into a slice [base, base+span] of the overall bar so it advances
  // monotonically across the three phases instead of resetting each time.
  const bandedEmit = (base: number, span: number): Emitter => async (event) => {
    const pct = (event.payload as { pct?: number })?.pct;
    if (event.event_type === 'progress' && typeof pct === 'number') {
      await persistAndEmit({ ...event, payload: { ...event.payload, pct: Math.round(base + (pct / 100) * span) } });
    } else {
      await persistAndEmit(event);
    }
  };

  // Run-wide meter for agents dispatched OUTSIDE steps (every standalone
  // agent). Cascade phases run inside `guarded` steps whose nested store
  // shadows this one, so nothing is counted twice. Persisted on completion
  // and on failure.
  const runWideMeter = newMeter();
  runMeter.enterWith(runWideMeter);

  try {
    let result: { summary: string; output: Record<string, unknown> };

    // Preflight. Every agent needs the engine account; probe it with a
    // one-token call before spending minutes of scan time and third-party
    // SERP budget. Out of capacity → fails here at 0%, non-retriable, operator
    // alerted, credits refunded — instead of at 75% after eight minutes.
    // For measuring agents the probe covers EVERY engine and resolves a live
    // model per engine (primary or verified fallback) — a retired upstream bot
    // fails here at 0% with its name, instead of after three 5-engine attempts.
    const measuring = agentId === 'monitor' || agentId === 'full_scan';
    const engineModels: Record<string, string> = await runStep('preflight-engine', async () => {
      if (!measuring) {
        await poeChat({ model: DEFAULT_MODEL, messages: [{ role: 'user', content: 'ping' }], maxTokens: 1, retries: 1 });
        return {};
      }
      const { data: rr } = await sb.from('agent_runs').select('trigger_method, options').eq('id', runId).maybeSingle();
      const diagnostic = rr?.trigger_method === 'diagnostic';
      const keys = rr?.trigger_method === 'preview'
        ? ['chatgpt', 'google_aio']
        : diagnostic && Array.isArray(rr?.options?.engineKeys) && rr.options.engineKeys.length
          ? (rr.options.engineKeys as string[])
          : undefined;
      // Diagnostic: a dead engine is dropped and named, not fatal.
      const { models, substituted, dead } = await resolveEngineModels(keys, { tolerateDead: diagnostic });
      if (substituted.length) {
        await persistAndEmit({ event_type: 'log', payload: { text: `Engine model substitution (primary unavailable upstream): ${substituted.join('; ')}` } });
      }
      if (dead.length) {
        await persistAndEmit({ event_type: 'log', payload: { text: `Diagnostic scan: skipping engines with no live model — ${dead.join(', ')}.` } });
      }
      return models;
    });
    // Diagnostic runs: partial engine set allowed, labelled, never indexed.
    const { data: runOpts } = measuring
      ? await sb.from('agent_runs').select('trigger_method, options').eq('id', runId).maybeSingle()
      : { data: null as any };
    const isDiagnostic = runOpts?.trigger_method === 'diagnostic';
    const diagnosticKeys: string[] | undefined = isDiagnostic
      ? (Array.isArray(runOpts?.options?.engineKeys) && runOpts.options.engineKeys.length
          ? (runOpts.options.engineKeys as string[])
          : Object.keys(engineModels).concat('google_aio')
        ).filter((k) => k === 'google_aio' || !!engineModels[k])
      : undefined;

    if (agentId === 'full_scan') {
      // One-click cascade: Discovery → Monitor → Report, all into this one run.
      // Per-plan billing levers (null for operator/channel orgs → defaults).
      // Trial preview (trigger_method='preview', dispatched by /api/onboarding):
      // fixed light policy — 2 engines × 8 prompts, no report phase, uncharged.
      const { data: runRow } = await sb.from('agent_runs').select('trigger_method').eq('id', runId).maybeSingle();
      const isPreview = runRow?.trigger_method === 'preview';
      const planPolicy = isPreview ? null : await planPolicyForProject(project.id).catch(() => null);
      const base = {
        brandName: project.brand_name,
        brandUrl: project.brand_url,
        targetCountry: project.target_country,
        targetLanguage: project.target_language,
        industry: project.industry,
        userPrompt,
        libraryCap: isPreview ? 4 : planPolicy?.promptLibraryCap,
        sampleCap: isPreview ? 8 : planPolicy?.sampledPerScan,
        ...(isPreview ? { engineKeys: ['chatgpt', 'google_aio'] } : {}),
        engineModels,
      };

      // Each phase is one Inngest step → its own short invocation, durable
      // resume. All side effects (emit + asset insert) live INSIDE the step so
      // they run exactly once even if a later phase resumes the function.
      const disc = await runStep('phase-discovery', async () => {
        await persistAndEmit({ event_type: 'milestone', payload: { label: 'Phase 1/3 · Discovery', step: 1, totalSteps: 3 } });
        // Panel stability: regenerating the prompt library on every scan was
        // the #1 source of score volatility (different questions → different
        // numbers). Reuse the existing library unless it is missing, stale
        // (>30 days), too small, or the user typed a fresh intent.
        if (!userPrompt) {
          const { data: ps } = await sb
            .from('assets')
            .select('content, created_at')
            .eq('project_id', project.id)
            .eq('type', 'prompt_set')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (ps?.content) {
            try {
              const parsed = JSON.parse(ps.content);
              const count = (parsed.promptSet || []).reduce((n: number, c: any) => n + (c.prompts || []).length, 0);
              const ageDays = (Date.now() - new Date(ps.created_at).getTime()) / 86400000;
              if (count >= 100 && ageDays < 30) {
                await persistAndEmit({
                  event_type: 'log',
                  payload: { text: `Reusing the existing ${count}-prompt library (built ${Math.round(ageDays)}d ago) so scores stay comparable scan-to-scan. The library refreshes monthly, or run Discovery with a new focus to rebuild it.` },
                });
                await persistAndEmit({ event_type: 'progress', payload: { pct: 33 } });
                return { summary: `Reused existing prompt library (${count} prompts).`, output: parsed };
              }
            } catch { /* corrupted asset → regenerate below */ }
          }
        }
        const d = await runDiscoveryAgent(base, bandedEmit(0, 33));
        await sb.from('assets').insert({
          project_id: project.id, agent_run_id: runId, type: 'prompt_set',
          title: `${project.brand_name} — Discovery prompt set`, format: 'json',
          content: JSON.stringify(d.output, null, 2),
          meta: { brand: project.brand_name, country: project.target_country },
        });
        return d;
      });

      // Preview: monitor and the site audit have no data dependency — run them
      // as PARALLEL Inngest steps (CREAO lesson, 8/31: deterministic tracks
      // decoupled). Monitor owns the progress band; site emits milestones only,
      // so the bar stays monotonic. Full scans keep monitor's original band.
      const runMonitorStep = () => runStep('phase-monitor', async () => {
        await persistAndEmit({ event_type: 'milestone', payload: { label: 'Phase 2/3 · Monitor', step: 2, totalSteps: 3 } });
        const rawPromptSet = ((disc.output as { promptSet?: unknown[] }).promptSet as { category: string; label: string; prompts: string[] }[]) || [];
        const rawKeyPrompts = ((disc.output as { keyPrompts?: unknown[] }).keyPrompts as string[]) || [];
        const edited = applyPromptEdits(await loadPromptEdits(sb, project.id), rawPromptSet, rawKeyPrompts);
        const { promptSet, keyPrompts } = applyCoreLock(await loadCoreKeyPrompts(sb, project.id), edited.promptSet, edited.keyPrompts);
        // No nested stepper: this whole phase is already one step.
        const m = await runMonitorAgent(
          { ...base, promptSet, keyPrompts, competitorSet: await loadCompetitorSet(sb, project.id), standardAnswers: await loadStandardAnswers(sb, project.id) },
          bandedEmit(33, isPreview ? 60 : 33),
        );
        await persistGoldenPool(sb, project, runId, m.output as Record<string, unknown>, isPreview || !!(m.output as any).partial);
        const sa = await recordCitationsAndIndex(sb, project.id, runId, await loadBrandDomains(sb, project), (m.output as { rawSamples?: any[] }).rawSamples || []);
        (m.output as Record<string, unknown>).sourceAuthority = sa;
        if (!('skipped' in (sa as any))) await queuePageFetch(project.id, runId);
        if ((m.output as any).competitorSetRefreshed) {
          await persistCompetitorSet(sb, project.id, (m.output as any).competitorSet);
        }
        await sb.from('assets').insert({
          project_id: project.id, agent_run_id: runId, type: 'geo_scorecard',
          title: `${project.brand_name} — GEO visibility scorecard`, format: 'json',
          content: JSON.stringify(m.output, null, 2),
          meta: { brand: project.brand_name, country: project.target_country },
        });
        return m;
      });

      if (isPreview) {
        // Preview also runs the Site audit (cheap: homepage fetch + one model
        // pass). Trial users see only the COUNTS — "X issues · Y fixes ·
        // unlock" — the teaser that carries the upgrade (founder ask 8/31).
        const runSiteStep = () => runStep('phase-site', async () => {
          await persistAndEmit({ event_type: 'milestone', payload: { label: 'Phase 3/3 · Site check', step: 3, totalSteps: 3 } });
          try {
            const r = await runSiteAgent(
              {
                brandName: project.brand_name,
                brandUrl: project.brand_url,
                targetCountry: project.target_country,
                targetLanguage: project.target_language,
                industry: project.industry,
                brandProfile: await loadBrandProfile(sb, project.id),
          citationBrief: await loadCitationBriefSafe(sb, project.id),
              },
              async (ev) => { if (ev.event_type !== 'progress') await persistAndEmit(ev); },
            );
            await sb.from('assets').insert({
              project_id: project.id, agent_run_id: runId, type: 'site_optimization',
              title: `${project.brand_name} — homepage AEO audit (preview)`, format: 'markdown',
              content: (r.output as { fullMarkdown?: string }).fullMarkdown ?? JSON.stringify(r.output, null, 2),
              meta: { brand: project.brand_name, preview: true },
            });
            return r;
          } catch {
            return null; // site unreachable or model hiccup — preview still ships
          }
        });
        const [mon, site] = await Promise.all([runMonitorStep(), runSiteStep()]);
        await persistAndEmit({ event_type: 'progress', payload: { pct: 100 } });
        result = {
          summary: `Preview scan complete — ${project.brand_name} baseline across ChatGPT and Google AI Overview.`,
          output: { aigvrScore: (mon.output as { aigvrScore?: number }).aigvrScore, scorecard: mon.output, discovery: disc.output, preview: true, site: site?.output ?? null },
        };
      } else {
        const mon = await runMonitorStep();
        const rep = await runStep('phase-report', async () => {
          await persistAndEmit({ event_type: 'milestone', payload: { label: 'Phase 3/3 · Report', step: 3, totalSteps: 3 } });
          const r = await runReportAgent({ ...base, targetLanguage: await loadDeliverableLanguage(sb, project), scorecard: mon.output, brandProfile: await loadBrandProfile(sb, project.id), citationBrief: await loadCitationBriefSafe(sb, project.id), siteCorpus: await loadSiteCorpus(sb, project) }, bandedEmit(66, 34));
          await sb.from('assets').insert({
            project_id: project.id, agent_run_id: runId, type: 'geo_report',
            title: `${project.brand_name} — GEO visibility report`, format: 'markdown',
            content: (r.output as { markdown?: string }).markdown ?? JSON.stringify(r.output, null, 2),
            meta: { brand: project.brand_name, country: project.target_country },
          });
          return r;
        });

        result = {
          summary: rep.summary,
          // All three phase outputs ride on the run so the workspace can credit
          // each deliverable from a full scan (deliverable-centric bookkeeping).
          output: { aigvrScore: (mon.output as { aigvrScore?: number }).aigvrScore, scorecard: mon.output, report: rep.output, discovery: disc.output },
        };
      }
    } else if (agentId === 'discovery') {
      result = await runDiscoveryAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          userPrompt,
          libraryCap: (await planPolicyForProject(project.id).catch(() => null))?.promptLibraryCap,
        },
        persistAndEmit,
      );
    } else if (agentId === 'answers') {
      // Standard Answer Library — canonical bilingual answers for the key prompts.
      const { data: psAsset } = await sb
        .from('assets')
        .select('content')
        .eq('project_id', project.id)
        .eq('type', 'prompt_set')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!psAsset?.content) throw new Error('No Discovery prompt set found. Run Discovery first.');
      let keyPrompts: string[] = [];
      try {
        const ps = JSON.parse(psAsset.content);
        keyPrompts = Array.isArray(ps?.keyPrompts) && ps.keyPrompts.length
          ? ps.keyPrompts
          : (ps?.promptSet || []).flatMap((c: any) => c.prompts || []).slice(0, 20);
      } catch {
        throw new Error('Discovery prompt set asset is corrupted — re-run Discovery.');
      }
      ({ keyPrompts } = applyPromptEdits(await loadPromptEdits(sb, project.id), [], keyPrompts));
      result = await runStandardAnswersAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          keyPrompts,
          brandProfile: await loadBrandProfile(sb, project.id),
        },
        persistAndEmit,
      );
    } else if (agentId === 'monitor') {
      // Monitor measures the latest Discovery prompt set against AI engines.
      const { data: psAsset } = await sb
        .from('assets')
        .select('content')
        .eq('project_id', project.id)
        .eq('type', 'prompt_set')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!psAsset?.content) {
        throw new Error('No Discovery prompt set found for this project. Run Discovery first.');
      }
      let promptSet: { category: string; label: string; prompts: string[] }[] = [];
      let keyPrompts: string[] = [];
      try {
        const ps = JSON.parse(psAsset.content);
        promptSet = ps?.promptSet ?? [];
        keyPrompts = Array.isArray(ps?.keyPrompts) ? ps.keyPrompts : [];
      } catch {
        throw new Error('Discovery prompt set asset is corrupted — re-run Discovery.');
      }
      if (!promptSet.length) {
        throw new Error('Discovery prompt set is empty — re-run Discovery.');
      }
      ({ promptSet, keyPrompts } = applyPromptEdits(await loadPromptEdits(sb, project.id), promptSet, keyPrompts));
      ({ promptSet, keyPrompts } = applyCoreLock(await loadCoreKeyPrompts(sb, project.id), promptSet, keyPrompts));
      result = await runMonitorAgent(
        {
          engineModels,
          ...(isDiagnostic ? { engineKeys: diagnosticKeys, allowPartial: true } : {}),
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          promptSet,
          keyPrompts,
          competitorSet: await loadCompetitorSet(sb, project.id),
          sampleCap: (await planPolicyForProject(project.id).catch(() => null))?.sampledPerScan,
          standardAnswers: await loadStandardAnswers(sb, project.id),
        },
        persistAndEmit,
      );
      // Partial engine sets never enter the citation index — they would bias
      // the source leverage and authority statistics toward the engines that
      // happened to be up.
      await persistGoldenPool(sb, project, runId, result.output as Record<string, unknown>, isDiagnostic || !!(result.output as any).partial);
      const sa = isDiagnostic || (result.output as any).partial
        ? { skipped: 'diagnostic' }
        : await recordCitationsAndIndex(sb, project.id, runId, await loadBrandDomains(sb, project), (result.output as { rawSamples?: any[] }).rawSamples || []);
      (result.output as Record<string, unknown>).sourceAuthority = sa;
      if (!('skipped' in (sa as any))) await queuePageFetch(project.id, runId);
      if ((result.output as any).competitorSetRefreshed) {
        await persistCompetitorSet(sb, project.id, (result.output as any).competitorSet);
      }
    } else if (agentId === 'report') {
      // Report turns the latest Monitor scorecard into a client deliverable.
      const { data: scAsset } = await sb
        .from('assets')
        .select('content')
        .eq('project_id', project.id)
        .eq('type', 'geo_scorecard')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!scAsset?.content) {
        throw new Error('No Monitor scorecard found for this project. Run Monitor first.');
      }
      let scorecard: unknown;
      try {
        scorecard = JSON.parse(scAsset.content);
      } catch {
        throw new Error('Monitor scorecard asset is corrupted — re-run Monitor.');
      }
      result = await runReportAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: await loadDeliverableLanguage(sb, project),
          industry: project.industry,
          scorecard,
          brandProfile: await loadBrandProfile(sb, project.id),
          citationBrief: await loadCitationBriefSafe(sb, project.id),
          siteCorpus: await loadSiteCorpus(sb, project),
        },
        persistAndEmit,
      );
    } else if (agentId === 'optimize') {
      // Optimize turns the top measured gap into a publish-ready content asset.
      const { data: scAsset } = await sb
        .from('assets')
        .select('content')
        .eq('project_id', project.id)
        .eq('type', 'geo_scorecard')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!scAsset?.content) {
        throw new Error('No Monitor scorecard found. Run Monitor (or Full Scan) first.');
      }
      let scorecard: any;
      try {
        scorecard = JSON.parse(scAsset.content);
      } catch {
        throw new Error('Scorecard asset corrupted — re-run Monitor.');
      }

      const order = ['discovery', 'consideration', 'evaluation', 'competitive', 'trust'];
      const rank = (s: string) => {
        const i = order.indexOf(s);
        return i < 0 ? 99 : i;
      };
      const gaps = (scorecard.gaps || []) as { prompt: string; stage: string; competitorsPresent?: string[] }[];
      let target: { query: string; stage: string; competitors?: string[] };
      if (gaps.length) {
        const g = [...gaps].sort((a, b) => rank(a.stage) - rank(b.stage))[0];
        target = { query: g.prompt, stage: g.stage, competitors: g.competitorsPresent };
      } else {
        // No gap → target the lowest-presence stage's first prompt.
        const { data: psAsset } = await sb
          .from('assets')
          .select('content')
          .eq('project_id', project.id)
          .eq('type', 'prompt_set')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const perStage = (scorecard.metrics?.perStage || []) as { stage: string; presence: number }[];
        const weakest = [...perStage].sort((a, b) => a.presence - b.presence)[0];
        let q = '';
        if (psAsset?.content) {
          try {
            const ps = (JSON.parse(psAsset.content).promptSet || []) as { category: string; prompts: string[] }[];
            const cat = ps.find((c) => c.category === weakest?.stage) || ps[0];
            q = cat?.prompts?.[0] || '';
          } catch {
            /* ignore */
          }
        }
        if (!q) throw new Error('No gap and no prompt available to optimize. Run Discovery + Monitor first.');
        target = { query: q, stage: weakest?.stage || 'discovery' };
      }

      result = await runOptimizeAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          target,
          brandProfile: await loadBrandProfile(sb, project.id),
          citationBrief: await loadCitationBriefSafe(sb, project.id),
        },
        persistAndEmit,
      );
    } else if (agentId === 'distribute') {
      // Distribute turns the Source-Authority targets into submission assets.
      const { data: scAsset } = await sb
        .from('assets')
        .select('content')
        .eq('project_id', project.id)
        .eq('type', 'geo_scorecard')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!scAsset?.content) {
        throw new Error('No Monitor scorecard found. Run Monitor (or Full Scan) first.');
      }
      let scorecard: any;
      try {
        scorecard = JSON.parse(scAsset.content);
      } catch {
        throw new Error('Scorecard asset corrupted — re-run Monitor.');
      }
      const sources = (scorecard.sourceAuthority?.ranking || []) as { domain: string; citations: number; isBrand: boolean }[];
      result = await runDistributeAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          sources,
          competitors: scorecard.competitors,
          brandProfile: await loadBrandProfile(sb, project.id),
        },
        persistAndEmit,
      );
    } else if (agentId === 'site') {
      // Homepage AEO upgrade — no prerequisite; fetches the brand site itself.
      result = await runSiteAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          brandProfile: await loadBrandProfile(sb, project.id),
          citationBrief: await loadCitationBriefSafe(sb, project.id),
        },
        persistAndEmit,
      );
    } else if (agentId === 'encyclopedia') {
      // Encyclopedia: notability assessment + entry/path. Grounds notability on
      // the Source-Authority sources if a scorecard exists (optional).
      const { data: scAsset } = await sb
        .from('assets')
        .select('content')
        .eq('project_id', project.id)
        .eq('type', 'geo_scorecard')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      let sources: { domain: string; citations: number; isBrand: boolean }[] = [];
      if (scAsset?.content) {
        try {
          sources = JSON.parse(scAsset.content)?.sourceAuthority?.ranking ?? [];
        } catch {
          /* optional grounding — ignore */
        }
      }
      result = await runEncyclopediaAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          sources,
          brandProfile: await loadBrandProfile(sb, project.id),
        },
        persistAndEmit,
      );
    } else if (agentId === 'profile') {
      // Canonical brand profile — fetches the site; grounds on Discovery /
      // Monitor hints if present. No hard prerequisite.
      let subVerticals: string[] = [];
      let competitors: string[] = [];
      const { data: psA } = await sb.from('assets').select('content').eq('project_id', project.id).eq('type', 'prompt_set').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (psA?.content) { try { subVerticals = JSON.parse(psA.content)?.subVerticals ?? []; } catch { /* ignore */ } }
      const { data: scA } = await sb.from('assets').select('content').eq('project_id', project.id).eq('type', 'geo_scorecard').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (scA?.content) { try { competitors = JSON.parse(scA.content)?.competitors ?? []; } catch { /* ignore */ } }
      result = await runProfileAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          hints: { subVerticals, competitors },
        },
        persistAndEmit,
      );
    } else {
      const def = AGENTS[agentId];
      await persistAndEmit({
        event_type: 'log',
        payload: { text: `${def?.displayName ?? agentId} — not yet implemented in v0.5. Stub run.` },
      });
      await persistAndEmit({ event_type: 'progress', payload: { pct: 100 } });
      result = {
        summary: `${def?.displayName ?? agentId} stub run completed (v0.5 placeholder).`,
        output: { stub: true, agent: agentId },
      };
    }

    await addRunTokens(sb, runId, runWideMeter);
    await sb
      .from('agent_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_pct: 100,
        summary: result.summary,
        output: result.output,
      })
      .eq('id', runId);

    if (agentId === 'discovery') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'prompt_set',
        title: `${project.brand_name} — Discovery prompt set`,
        format: 'json',
        content: JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'answers') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'standard_answers',
        title: `${project.brand_name} — Standard answer library`,
        format: 'json',
        content: JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'monitor') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'geo_scorecard',
        title: `${project.brand_name} — GEO visibility scorecard`,
        format: 'json',
        content: JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'report') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'geo_report',
        title: `${project.brand_name} — GEO visibility report`,
        format: 'markdown',
        content: (result.output as { markdown?: string }).markdown ?? JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'optimize') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'content_draft',
        title: `${project.brand_name} — ${(result.output as { title?: string }).title ?? 'GEO content draft'}`,
        format: 'markdown',
        content: (result.output as { fullMarkdown?: string }).fullMarkdown ?? JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, targetQuery: (result.output as { targetQuery?: string }).targetQuery },
      });
    } else if (agentId === 'distribute') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'distribution_kit',
        title: `${project.brand_name} — GEO distribution kit`,
        format: 'markdown',
        content: (result.output as { fullMarkdown?: string }).fullMarkdown ?? JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'site') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'site_optimization',
        title: `${project.brand_name} — homepage AEO upgrade`,
        format: 'markdown',
        content: (result.output as { fullMarkdown?: string }).fullMarkdown ?? JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'encyclopedia') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'encyclopedia_entry',
        title: `${project.brand_name} — encyclopedia entry & path`,
        format: 'markdown',
        content: (result.output as { fullMarkdown?: string }).fullMarkdown ?? JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'profile') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'brand_profile',
        title: `${project.brand_name} — canonical brand profile`,
        format: 'json',
        content: JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await addRunTokens(sb, runId, runWideMeter);
    await persistAndEmit({ event_type: 'error', payload: { message: msg } });
    await sb
      .from('agent_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: msg,
      })
      .eq('id', runId);
    // Platform-level causes page the operator. Capacity exhaustion takes down
    // every LLM-backed run on the platform; the founder must not learn of it
    // from a customer (2026-09-07).
    const root = isNonRetriable(err) ? err : (err as any)?.cause;
    const capacity = isCapacityError(root);
    const outage = !capacity && isNonRetriable(root);
    if (capacity || outage) {
      await notifyOperator({
        kind: capacity ? 'engine_capacity' : 'scan_incomplete',
        title: capacity
          ? 'AI engine capacity exhausted — all scans failing'
          : `Engine outage — scans failing (${((root as any)?.engines ?? []).join(', ') || 'see detail'})`,
        detail: msg,
        runId,
        projectId: project.id,
        projectSlug: (project as any).slug,
        brand: project.brand_name,
      }).catch((e) => console.error('[alerts] notifyOperator failed:', e));
    }
    // Failed runs never keep the client's credits (idempotent, pool-mirroring).
    try {
      const refunded = await refundFailedRun(sb, runId);
      if (refunded > 0) await persistAndEmit({ event_type: 'log', payload: { text: `Run failed — ${refunded} credits refunded automatically.` } });
    } catch { /* refund is best-effort; ledger stays consistent via idempotency */ }
  }
}
