// Collaboration alignment — a federated-learning trust score applied to the
// client team (FMVN, 2026-09-29).
//
// In FL a server trusts a client update by the angle between the client's
// update and its own reference update: cos(w_k, w_s), clipped at 0 (FLTrust).
// Here:
//   w_s  "server model" — where the measured gaps say effort should go, over
//        the locked Core 20 questions: 1 − (answers naming the brand ÷ answers)
//        on each question in the baseline scan (the last scan before the
//        period starts, i.e. what was known when the team chose its work).
//   w_k  "client update" — what the client team actually did in the period on
//        the same questions: its own attributed actions (interventions,
//        weighted by kind) and standard-answer edits. Work aimed at questions
//        outside the Core 20 lands in an "other" coordinate that w_s weights 0.
//   trust = max(0, cos(w_k, w_s)).  ‖w_k‖ = 0 → null ("no update"), never 0:
//        an absent client is not a disagreeing one.
// Governance contributions (fact edits, prompt / competitor-set edits) carry no
// question direction; they count as participation, not direction.
// Only the client org's own people count. MemeCMO operators (root-org members)
// and operator/proxy rows are excluded — an update we typed is not theirs.

import { unitHash } from '@/lib/edits';

const normPrompt = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[?？.!,\s]+/g, ' ').trim();

// Effort weight per action kind: placements and pages the engines read carry
// full weight; structural and listing work half.
const KIND_WEIGHT: Record<string, number> = {
  third_party_placement: 1, content_page: 1, encyclopedia: 1,
  site_update: 0.5, schema: 0.5, directory_profile: 0.5, other: 0.5,
};
const ANSWER_EDIT_WEIGHT = 0.5;

export interface AlignmentDim { prompt: string; gap: number; effort: number; present: number; total: number }
export interface AlignmentUpdate { prompts: string[]; weight: number }
export interface AlignmentResult {
  dims: AlignmentDim[];
  otherEffort: number;          // effort on questions outside the Core 20
  cos: number | null;           // null when the client made no directional update
  trust: number | null;         // max(0, cos)
  onPlanShare: number | null;   // share of directional effort landing on Core 20 questions
  neglected: AlignmentDim[];    // largest gaps that received no effort
}

/** Pure math: vectors over the Core 20 (+ "other"), cosine, clipping. */
export function computeAlignment(input: {
  core: string[];
  baselineSamples: { prompt: string; brandPresent?: boolean }[];
  rewrites?: { from: string; to: string }[];
  updates: AlignmentUpdate[];
}): AlignmentResult {
  const idx = new Map<string, number>();
  input.core.forEach((p, i) => idx.set(normPrompt(p), i));
  // A localized rewrite still points at its Core question.
  for (const r of input.rewrites ?? []) {
    const i = idx.get(normPrompt(r.from));
    if (i != null) idx.set(normPrompt(r.to), i);
  }
  const dims: AlignmentDim[] = input.core.map((p) => ({ prompt: p, gap: 0, effort: 0, present: 0, total: 0 }));
  for (const s of input.baselineSamples) {
    const i = idx.get(normPrompt(s.prompt || ''));
    if (i == null) continue;
    dims[i].total += 1;
    if (s.brandPresent) dims[i].present += 1;
  }
  for (const d of dims) d.gap = d.total ? 1 - d.present / d.total : 0;

  let otherEffort = 0;
  for (const u of input.updates) {
    const hits = [...new Set(u.prompts.map((p) => idx.get(normPrompt(p))).filter((i): i is number => i != null))];
    if (!hits.length) { otherEffort += u.weight; continue; }
    for (const i of hits) dims[i].effort += u.weight / hits.length; // one action split over its targets
  }

  const dot = dims.reduce((a, d) => a + d.gap * d.effort, 0);
  const nS = Math.sqrt(dims.reduce((a, d) => a + d.gap * d.gap, 0));
  const nK = Math.sqrt(dims.reduce((a, d) => a + d.effort * d.effort, 0) + otherEffort * otherEffort);
  const cos = nK > 0 && nS > 0 ? dot / (nS * nK) : null;
  const onEffort = dims.reduce((a, d) => a + d.effort, 0);
  return {
    dims,
    otherEffort,
    cos: cos == null ? null : Math.round(cos * 1000) / 1000,
    trust: cos == null ? null : Math.round(Math.max(0, cos) * 1000) / 1000,
    onPlanShare: onEffort + otherEffort > 0 ? Math.round((onEffort / (onEffort + otherEffort)) * 100) / 100 : null,
    neglected: dims.filter((d) => d.effort === 0 && d.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 3),
  };
}

export interface CollabAlignment extends AlignmentResult {
  from: string;
  to: string;
  baselineRunId: string | null;
  participation: {
    actions: number;         // attributed interventions in the period
    answerEdits: number;     // attributed standard-answer edits
    factEdits: number;       // attributed brand-profile edits (governance)
    setEdits: number;        // attributed prompt / competitor-set edits (governance)
    clientPeople: number;    // accounts counted as the client team
  };
}

/** Load the period's data for one project and compute the alignment. */
export async function loadCollabAlignment(sb: any, projectId: string, from: Date, to: Date): Promise<CollabAlignment> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  // A failed read must fail loudly: an empty result here would read as "the
  // team made no updates", which is a claim about people, not a network blip.
  const must = <T,>(r: { data: T; error: any }, what: string): T => {
    if (r.error) throw new Error(`collab-alignment: ${what}: ${r.error.message ?? r.error}`);
    return r.data;
  };
  const project = must(await sb.from('projects').select('id, organization_id, metadata').eq('id', projectId).maybeSingle(), 'project') as any;
  if (!project) throw new Error('collab-alignment: project not found');
  const meta = (project.metadata ?? {}) as any;
  const core: string[] = Array.isArray(meta.coreKeyPrompts) ? meta.coreKeyPrompts : [];

  // Client team = members of the project's org (and its parent), minus root-org members.
  const org = must(await sb.from('organizations').select('id, parent_org_id').eq('id', project.organization_id).maybeSingle(), 'org') as any;
  const orgIds = [org?.id, org?.parent_org_id].filter(Boolean);
  const root = must(await sb.from('organizations').select('id').eq('type', 'root').maybeSingle(), 'root org') as any;
  const [memsR, rootMemsR] = await Promise.all([
    sb.from('organization_members').select('user_id').in('organization_id', orgIds),
    root ? sb.from('organization_members').select('user_id').eq('organization_id', root.id) : Promise.resolve({ data: [], error: null }),
  ]);
  const mems = must(memsR, 'members') as any[];
  const rootMems = must(rootMemsR, 'root members') as any[];
  const operators = new Set((rootMems ?? []).map((m: any) => String(m.user_id)));
  const people = new Set((mems ?? []).map((m: any) => String(m.user_id)).filter((id: string) => !operators.has(id)));
  const emails = new Set<string>();
  for (const id of people) {
    try {
      const { data } = await sb.auth.admin.getUserById(id);
      if (data?.user?.email) emails.add(String(data.user.email).toLowerCase());
    } catch { /* email lookup is best-effort; ids still match */ }
  }
  const isClient = (who: unknown) => {
    const w = String(who ?? '').toLowerCase();
    return !!w && (people.has(w) || emails.has(w));
  };

  // Baseline = last completed Monitor scan before the period (scheduled first).
  const scans = must(await sb
    .from('agent_runs')
    .select('id, created_at, trigger_method, output->rawSamples')
    .eq('project_id', projectId).eq('agent_id', 'monitor').eq('status', 'completed')
    .lt('created_at', fromIso).order('created_at', { ascending: false }).limit(4), 'baseline scan') as any[];
  const baseline = (scans ?? []).find((s: any) => s.trigger_method === 'schedule') ?? (scans ?? [])[0] ?? null;

  const [ivxR, editsR] = await Promise.all([
    sb.from('interventions').select('kind, target_prompts, logged_by, published_at')
      .eq('project_id', projectId).eq('status', 'live')
      .gte('published_at', fromIso.slice(0, 10)).lte('published_at', toIso.slice(0, 10)),
    sb.from('asset_edits').select('asset_type, unit_key, edited_by, source, edited_at')
      .eq('project_id', projectId).gte('edited_at', fromIso).lte('edited_at', toIso),
  ]);
  const ivx = must(ivxR, 'interventions') as any[];
  const edits = must(editsR, 'asset edits') as any[];

  const updates: AlignmentUpdate[] = [];
  let actions = 0;
  for (const iv of ivx ?? []) {
    if (!isClient(iv.logged_by)) continue;
    actions += 1;
    const prompts = (Array.isArray(iv.target_prompts) ? iv.target_prompts : []).map((t: any) => String(t?.prompt ?? ''));
    updates.push({ prompts, weight: KIND_WEIGHT[iv.kind] ?? 0.5 });
  }
  // Standard-answer edits are keyed answer:<hash>:<lang>; recover the question by hash.
  const byHash = new Map<string, string>(core.map((p) => [unitHash(p), p]));
  let answerEdits = 0;
  let factEdits = 0;
  for (const e of edits ?? []) {
    if (!isClient(e.edited_by) || e.source === 'operator') continue;
    if (e.asset_type === 'standard_answers') {
      answerEdits += 1;
      const h = String(e.unit_key).split(':')[1] ?? '';
      updates.push({ prompts: byHash.has(h) ? [byHash.get(h)!] : [], weight: ANSWER_EDIT_WEIGHT });
    } else if (e.asset_type === 'brand_profile') {
      factEdits += 1;
    }
  }
  const inPeriod = (at: unknown) => { const t = String(at ?? ''); return t >= fromIso && t <= toIso; };
  const setEdits =
    (Array.isArray(meta.promptEditLog) ? meta.promptEditLog : []).filter((l: any) => inPeriod(l.at) && isClient(l.by)).length +
    (Array.isArray(meta.competitorSetLog) ? meta.competitorSetLog : []).filter((l: any) => inPeriod(l.at) && isClient(l.by)).length;

  const result = computeAlignment({
    core,
    baselineSamples: ((baseline as any)?.rawSamples ?? []) as { prompt: string; brandPresent?: boolean }[],
    rewrites: meta.promptEdits?.rewrites ?? [],
    updates,
  });
  return {
    ...result,
    from: fromIso.slice(0, 10),
    to: toIso.slice(0, 10),
    baselineRunId: baseline?.id ?? null,
    participation: { actions, answerEdits, factEdits, setEdits, clientPeople: people.size },
  };
}
