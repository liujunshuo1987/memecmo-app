// Intervention → outcome telemetry.
//
// An intervention is something the client put into the world that AI engines
// can read (a page, schema, a directory profile, a placement). Its OUTCOME is
// never stored: it is computed from the comparable scans before and after the
// publish date — per targeted prompt, per engine, brand presence before vs
// after; and for the intervention's domain, how often engines cite it before
// vs after. Numbers carry their fractions so a reader can check them, and the
// digest's verification gate is fed the same figures.

import { unitHash } from '@/lib/edits';
import { INTERVENTION_KINDS, type InterventionKind } from '@/lib/action-input';

// The kinds live in lib/action-input (client-safe) so the browser can name them too.
export { INTERVENTION_KINDS, type InterventionKind };

export interface Intervention {
  id: string;
  project_id: string;
  kind: InterventionKind;
  url: string | null;
  domain: string | null;
  title: string | null;
  note: string | null;
  target_prompts: { hash: string; prompt: string }[];
  source_asset_type: string | null;
  source_run_id: string | null;
  published_at: string; // YYYY-MM-DD
  status: 'live' | 'removed';
  created_at: string;
  logged_by?: string | null;
  channel?: 'web' | 'lark' | 'connector';
  // Phase 2 verification (lib/pages/verify): is the page live, how long, when it last changed.
  verified_at?: string | null;
  page_ok?: boolean | null;
  page_status?: number | null;
  page_title?: string | null;
  page_words?: number | null;
  text_hash?: string | null;
  changed_at?: string | null;
  verify_error?: string | null;
}

export interface CitedAfter { cites: number; engines: number; firstTs: string | null }

// Was the intervention's exact url cited after its publish date? (SQL, by domain index)
export async function citedAfterMap(sb: any, projectId: string, list: Intervention[]): Promise<Record<string, CitedAfter>> {
  const out: Record<string, CitedAfter> = {};
  for (const iv of list) {
    if (!iv.url || !iv.domain) continue;
    const { data } = await sb.rpc('geo_url_cites', { p_project_id: projectId, p_domain: iv.domain, p_url: iv.url, p_after: `${iv.published_at}T00:00:00Z` });
    const r = Array.isArray(data) ? data[0] : data;
    if (r) out[iv.id] = { cites: Number(r.cites ?? 0), engines: Number(r.engines ?? 0), firstTs: r.first_ts ?? null };
  }
  return out;
}

export interface EngineWindow { present: number; total: number }
export interface PromptOutcome { hash: string; prompt: string; engines: { engine: string; before: EngineWindow; after: EngineWindow }[] }
export interface Outcome {
  scansBefore: number;
  scansAfter: number;
  awaiting: boolean;          // no comparable scan after the publish date yet
  prompts: PromptOutcome[];
  domain: { domain: string; before: { cites: number; engines: string[] }; after: { cites: number; engines: string[] } } | null;
  /** Set by a reader that shows the domain line: engine-side changes that make its before and after not comparable (breaksAffecting). */
  sourceBreaks?: SourceBreak[];
}

/** An engine started listing a different number of sources per answer: from the
 *  scan dated `from`, about `after` per answer where it was about `before`. */
export interface SourceBreak { engine: string; from: string; before: number; after: number }

export const domainOf = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
};

/** Live actions, newest publish date first. One page: `limit` rows (50 unless
 *  asked) from `offset`. Same-day rows keep one order across pages (logged
 *  last first, then id), so paging neither repeats nor skips a row. */
export async function loadInterventions(sb: any, projectId: string, opts: { sourceRunId?: string; limit?: number; offset?: number } = {}): Promise<Intervention[]> {
  const from = Math.max(0, opts.offset ?? 0);
  let q = sb.from('interventions').select('*').eq('project_id', projectId).eq('status', 'live')
    .order('published_at', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: true })
    .range(from, from + (opts.limit ?? 50) - 1);
  if (opts.sourceRunId) q = q.eq('source_run_id', opts.sourceRunId);
  const { data } = await q;
  return Array.isArray(data) ? data : [];
}

/** How many live actions the project has — a page of them is not the ledger. Null when the count could not be read. */
export async function countInterventions(sb: any, projectId: string): Promise<number | null> {
  const { count, error } = await sb.from('interventions').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'live');
  return error || typeof count !== 'number' ? null : count;
}

export interface Logger { name: string | null; operator: boolean }

/** Who logged each action, for display, keyed by user id. A MemeCMO operator
 *  (root-org member) on a client's project is named as such and their address
 *  is not sent; anyone else is named by sign-in email, as on the Lark card.
 *  Same split as collab-alignment: client team = org members minus root-org members. */
export async function loggersOf(sb: any, orgId: string, list: Intervention[]): Promise<Record<string, Logger>> {
  return peopleOf(sb, orgId, list.map((iv) => iv.logged_by));
}

/** The same naming for any set of accounts (loggers, editors). */
export async function peopleOf(sb: any, orgId: string, userIds: (string | null | undefined)[]): Promise<Record<string, Logger>> {
  const ids = Array.from(new Set(userIds.filter(Boolean))) as string[];
  const out: Record<string, Logger> = {};
  if (!ids.length) return out;
  const operators = new Set<string>();
  const { data: root } = await sb.from('organizations').select('id').eq('type', 'root').maybeSingle();
  if (root && root.id !== orgId) {
    const { data: mems } = await sb.from('organization_members').select('user_id').eq('organization_id', root.id).in('user_id', ids);
    for (const m of mems ?? []) operators.add(String(m.user_id));
  }
  await Promise.all(ids.map(async (id) => {
    if (operators.has(id)) { out[id] = { name: null, operator: true }; return; }
    let name: string | null = null;
    try { const { data } = await sb.auth.admin.getUserById(id); name = data?.user?.email ?? null; } catch { /* display only */ }
    out[id] = { name, operator: false };
  }));
  return out;
}

// ── Changes to a logged action: who, when, from what ─────────────────────────
// An action is the client's record. Its publish date splits the before/after
// outcome, and the delivery scorecard counts who logged it, the date and the
// target question, so a change must say who made it and what it replaced. The
// row keeps the current values; each change is a row of intervention_edits:
// { field: { from, to } }, its author and time ('remove' = status live → removed).
// That table is not in the schema yet (decision open, 2026-10-19). Until it
// exists nothing is edited: PATCH answers 503 and the panel offers no edit or
// remove (editTrailReady). Readers of the outcome never read it.

export const EDIT_TRAIL = 'intervention_edits';
export type EditChanges = Record<string, { from: unknown; to: unknown }>;
export interface LastEdit { at: string; by: string | null }

let trail: { ok: boolean; at: number } | null = null;
/** Can a change be recorded? Once the table answers it stays so; a missing one is asked again after a minute. */
export async function editTrailReady(sb: any): Promise<boolean> {
  if (trail && (trail.ok || Date.now() - trail.at < 60_000)) return trail.ok;
  // A GET, not a HEAD: postgrest-js reads a HEAD's empty 404 (no such table) as success.
  const { error } = await sb.from(EDIT_TRAIL).select('id').limit(1);
  trail = { ok: !error, at: Date.now() };
  return trail.ok;
}

/** Record one change before it is made. The id of the record, or null when it could not be written (then the change must not be made). */
export async function recordEdit(sb: any, e: { interventionId: string; projectId: string; action: 'edit' | 'remove'; changes: EditChanges; userId: string; channel?: 'web' | 'lark' | 'connector' }): Promise<string | null> {
  const { data, error } = await sb.from(EDIT_TRAIL).insert({
    intervention_id: e.interventionId, project_id: e.projectId, action: e.action, changes: e.changes, edited_by: e.userId, channel: e.channel ?? 'web',
  }).select('id').single();
  if (error) { console.error('[interventions] edit not recorded', e.interventionId, error.message); return null; }
  return data?.id ?? null;
}

/** The latest edit of each action, for "edited on … by …". Empty when the trail is not there. */
export async function lastEdits(sb: any, ids: string[]): Promise<Record<string, LastEdit>> {
  const out: Record<string, LastEdit> = {};
  if (!ids.length || !(await editTrailReady(sb))) return out;
  const { data } = await sb.from(EDIT_TRAIL).select('intervention_id, edited_by, edited_at').in('intervention_id', ids).eq('action', 'edit').order('edited_at', { ascending: false });
  for (const r of data ?? []) if (!out[r.intervention_id]) out[r.intervention_id] = { at: String(r.edited_at), by: r.edited_by ?? null };
  return out;
}

/** What a change would do to a row: only the fields whose value moves, as { from, to }. Target questions compare by their hashes. */
export function diffAction(row: Intervention, next: Partial<Pick<Intervention, 'kind' | 'url' | 'title' | 'note' | 'published_at' | 'target_prompts'>>): EditChanges {
  const out: EditChanges = {};
  for (const [k, to] of Object.entries(next) as [keyof Intervention, unknown][]) {
    if (to === undefined) continue;
    const from = row[k] ?? null;
    const same = k === 'target_prompts'
      ? ((from as { hash: string }[] | null) ?? []).map((p) => p.hash).sort().join() === ((to as { hash: string }[]) ?? []).map((p) => p.hash).sort().join()
      : from === to;
    if (!same) out[k] = { from, to };
  }
  return out;
}

interface ScanLite { id: string; at: string; samples: any[] }

async function loadComparableScans(sb: any, projectId: string, maxScans: number): Promise<ScanLite[]> {
  const { data } = await sb
    .from('agent_runs')
    .select('id, completed_at, output')
    .eq('project_id', projectId)
    .in('agent_id', ['monitor', 'full_scan'])
    .eq('status', 'completed')
    .neq('trigger_method', 'diagnostic')
    .order('completed_at', { ascending: false })
    .limit(maxScans);
  return (data ?? [])
    .map((r: any) => ({ id: r.id, at: r.completed_at, samples: r.output?.rawSamples ?? r.output?.scorecard?.rawSamples ?? [] }))
    .filter((s: ScanLite) => s.samples.length)
    .reverse();
}

/** Outcomes for a set of interventions, from the project's own comparable
 *  scans. Bounded to the most recent `maxScans` scans (each carries ~120
 *  answers), which covers ~3 months of weekly cadence. */
export async function computeOutcomes(sb: any, projectId: string, interventions: Intervention[], maxScans = 16): Promise<Record<string, Outcome>> {
  return (await computeOutcomesAndBreaks(sb, projectId, interventions, maxScans)).outcomes;
}

/** The same outcomes, with what the same scans say about each engine's source
 *  lists (sourceCountBreaks). The figures are computeOutcomes' own: one load,
 *  one loop, nothing recounted. */
export async function computeOutcomesAndBreaks(sb: any, projectId: string, interventions: Intervention[], maxScans = 16): Promise<{ outcomes: Record<string, Outcome>; breaks: SourceBreak[] }> {
  const out: Record<string, Outcome> = {};
  if (!interventions.length) return { outcomes: out, breaks: [] };
  const scans = await loadComparableScans(sb, projectId, maxScans);
  for (const iv of interventions) {
    const cut = new Date(iv.published_at + 'T00:00:00Z').getTime();
    const before = scans.filter((s) => new Date(s.at).getTime() < cut);
    const after = scans.filter((s) => new Date(s.at).getTime() >= cut);
    const win = (set: ScanLite[], hash: string, engine: string): EngineWindow => {
      let present = 0, total = 0;
      for (const s of set) for (const a of s.samples) {
        if (a.engine !== engine || unitHash(String(a.prompt)) !== hash) continue;
        total++; if (a.brandPresent) present++;
      }
      return { present, total };
    };
    const engines = Array.from(new Set(scans.flatMap((s) => s.samples.map((a: any) => String(a.engine)))));
    const prompts: PromptOutcome[] = (iv.target_prompts ?? []).map((tp) => ({
      hash: tp.hash,
      prompt: tp.prompt,
      engines: engines
        .map((engine) => ({ engine, before: win(before, tp.hash, engine), after: win(after, tp.hash, engine) }))
        .filter((e) => e.before.total + e.after.total > 0),
    }));
    let domain: Outcome['domain'] = null;
    if (iv.domain) {
      const cites = (set: ScanLite[]) => {
        let n = 0; const eng = new Set<string>();
        for (const s of set) for (const a of s.samples) for (const u of a.citations ?? []) {
          if (domainOf(String(u)) === iv.domain) { n++; eng.add(String(a.engine)); }
        }
        return { cites: n, engines: [...eng] };
      };
      domain = { domain: iv.domain, before: cites(before), after: cites(after) };
    }
    out[iv.id] = { scansBefore: before.length, scansAfter: after.length, awaiting: after.length === 0, prompts, domain };
  }
  return { outcomes: out, breaks: sourceCountBreaks(scans) };
}

// ── Measurement note: an engine that changes how many sources it lists ────────
// The domain line counts citations of a whole site before and after a publish
// date. When an engine starts listing a fifth of the sources it used to, that
// count falls for every site at once, whatever the brand did. Nothing here
// changes a figure: it only says when the two sides are not comparable.

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
// A factor of two or more, and the higher side lists at least one source per answer.
const apart = (a: number, b: number): boolean => Math.max(a, b) >= 1 && Math.max(a, b) >= 2 * Math.min(a, b);

/** In one engine's series of sources per answer (one value per scan, oldest
 *  first): the point from which it lists a different number. At least two
 *  scans on each side, medians a factor of two apart, and still so with any
 *  one scan left out, so a single odd scan is never a break. Where several
 *  points qualify, the one that leaves each side closest to its own median. */
export function seriesBreak(values: number[]): { at: number; before: number; after: number } | null {
  let best: { at: number; before: number; after: number; spread: number } | null = null;
  const without = (xs: number[], i: number) => xs.filter((_, j) => j !== i);
  for (let at = 2; at <= values.length - 2; at++) {
    const b = values.slice(0, at), a = values.slice(at);
    const mb = median(b), ma = median(a);
    if (!apart(mb, ma)) continue;
    if (!b.every((_, i) => apart(median(without(b, i)), ma)) || !a.every((_, i) => apart(mb, median(without(a, i))))) continue;
    const off = (xs: number[], m: number) => xs.reduce((n, x) => n + Math.abs(Math.log1p(x) - Math.log1p(m)), 0);
    const spread = off(b, mb) + off(a, ma);
    if (!best || spread < best.spread) best = { at, before: mb, after: ma, spread };
  }
  return best && { at: best.at, before: best.before, after: best.after };
}

/** Per engine, from the comparable scans (oldest first): sources listed ÷
 *  answers in each scan the engine answered in, and the break in that series if there is one. */
export function sourceCountBreaks(scans: { at: string; samples: any[] }[]): SourceBreak[] {
  const engines = Array.from(new Set(scans.flatMap((s) => s.samples.map((a: any) => String(a.engine)))));
  const out: SourceBreak[] = [];
  for (const engine of engines) {
    const points: { at: string; perAnswer: number }[] = [];
    for (const s of scans) {
      const answers = s.samples.filter((a: any) => String(a.engine) === engine);
      if (answers.length) points.push({ at: s.at, perAnswer: answers.reduce((n: number, a: any) => n + (a.citations ?? []).length, 0) / answers.length });
    }
    const found = seriesBreak(points.map((p) => p.perAnswer));
    if (found) out.push({ engine, from: String(points[found.at].at).slice(0, 10), before: found.before, after: found.after });
  }
  return out;
}

/** The breaks that bear on one outcome's domain line: it compares scans on
 *  both sides of the publish date, and the engine is one that cites that site. */
export function breaksAffecting(o: Outcome, breaks: SourceBreak[]): SourceBreak[] {
  if (!o.domain || !o.scansBefore || !o.scansAfter) return [];
  const citing = new Set([...o.domain.before.engines, ...o.domain.after.engines]);
  return breaks.filter((b) => citing.has(b.engine));
}

/** Every number an outcome presents — fed to the digest's verification gate
 *  so claims quoting them are not demoted as unsupported. */
export function outcomeFigures(outcomes: Record<string, Outcome>): number[] {
  const f: number[] = [];
  for (const o of Object.values(outcomes)) {
    f.push(o.scansBefore, o.scansAfter);
    for (const p of o.prompts) for (const e of p.engines) {
      f.push(e.before.present, e.before.total, e.after.present, e.after.total);
      if (e.before.total) f.push(Math.round((100 * e.before.present) / e.before.total));
      if (e.after.total) f.push(Math.round((100 * e.after.present) / e.after.total));
    }
    if (o.domain) {
      f.push(o.domain.before.cites, o.domain.after.cites);
      if (o.scansBefore) f.push(Math.round(o.domain.before.cites / o.scansBefore));
      if (o.scansAfter) f.push(Math.round(o.domain.after.cites / o.scansAfter));
    }
  }
  return f;
}

/** "202 in 2 scans (101/scan)" — a citation count is only comparable with its
 *  scan count; before/after windows rarely hold the same number of scans. */
export const citesPerScan = (cites: number, scans: number): string =>
  scans ? `${cites} in ${scans} scan${scans === 1 ? '' : 's'} (${Math.round(cites / scans)}/scan)` : `${cites}`;

/** Plain-text rendering (for the interpretation prompt and logs). */
export function describeOutcome(iv: Intervention, o: Outcome): string {
  const head = `${iv.kind}${iv.url ? ` ${iv.url}` : ''} · published ${iv.published_at} · ${o.scansBefore} scans before, ${o.scansAfter} after`;
  if (o.awaiting) return `${head} — awaiting the next scan`;
  const lines: string[] = [head];
  for (const p of o.prompts) {
    const parts = p.engines.map((e) => `${e.engine} ${e.before.present}/${e.before.total} → ${e.after.present}/${e.after.total}`);
    lines.push(`  prompt "${p.prompt.slice(0, 80)}": brand present ${parts.join(' · ')}`);
  }
  if (o.domain) lines.push(`  ${o.domain.domain} cited ${citesPerScan(o.domain.before.cites, o.scansBefore)} → ${citesPerScan(o.domain.after.cites, o.scansAfter)} (engines after: ${o.domain.after.engines.join(', ') || 'none'})`);
  return lines.join('\n');
}
