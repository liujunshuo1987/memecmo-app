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

export const INTERVENTION_KINDS = ['content_page', 'schema', 'third_party_placement', 'encyclopedia', 'directory_profile', 'site_update', 'other'] as const;
export type InterventionKind = (typeof INTERVENTION_KINDS)[number];

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
}

export const domainOf = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
};

export async function loadInterventions(sb: any, projectId: string, opts: { sourceRunId?: string; limit?: number } = {}): Promise<Intervention[]> {
  let q = sb.from('interventions').select('*').eq('project_id', projectId).eq('status', 'live').order('published_at', { ascending: false }).limit(opts.limit ?? 50);
  if (opts.sourceRunId) q = q.eq('source_run_id', opts.sourceRunId);
  const { data } = await q;
  return Array.isArray(data) ? data : [];
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
  const out: Record<string, Outcome> = {};
  if (!interventions.length) return out;
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
  return out;
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
