// Golden evaluation set — sampling and agreement.
//
// Sampling is stratified over language × engine × machine.brandMentioned so
// the labelled set mirrors the judge's real input distribution instead of
// drowning in "brand absent" answers (≈50–60% of the pool). Agreement is
// computed per field, machine vs human, with chance-corrected kappa where a
// plain accuracy would flatter a majority class.

// Sample size is derived, not asserted. Gating a judge swap means estimating
// an agreement rate p per language with a 95% CI. For p ≈ 0.85 (where a good
// judge sits) the half-width is 1.96·sqrt(p(1−p)/n): n=100 → ±7 pts,
// n=200 → ±5 pts, n=300 → ±4 pts. 200 buys most of the precision at 2/3 of
// the labour; raise it only if two candidates land within 5 points.
export const GOLDEN_TARGET_PER_LANGUAGE = 200;
export const GOLDEN_LANGUAGES = ['vi', 'zh', 'en'] as const;

export interface PoolItem {
  id: string; language: string; engine: string; model: string | null; stage: string | null; intent: string | null;
  key_prompt: boolean; prompt: string; answer_text: string; brand_name: string; competitor_names: string[];
}
export interface Label { brand_mentioned: boolean; prominence: number; sentiment: string; competitors: string[] }

export async function progress(sb: any): Promise<Record<string, { pool: number; labeled: number; target: number }>> {
  const out: Record<string, { pool: number; labeled: number; target: number }> = {};
  for (const lang of GOLDEN_LANGUAGES) {
    const { count: pool } = await sb.from('golden_pool').select('id', { count: 'exact', head: true }).eq('language', lang);
    const { data: ids } = await sb.from('golden_pool').select('id, golden_labels!inner(id)').eq('language', lang).limit(5000);
    out[lang] = { pool: pool ?? 0, labeled: Array.isArray(ids) ? ids.length : 0, target: GOLDEN_TARGET_PER_LANGUAGE };
  }
  return out;
}

/** Next unlabelled item for this labeler: the stratum (engine × machine
 *  brandMentioned) with the fewest labels that still has unlabelled items,
 *  then a random member. Machine labels are used for stratification only and
 *  never returned to the client. */
export async function nextItemFor(sb: any, language: string, labeler: string): Promise<PoolItem | null> {
  const { data: pool, error } = await sb.from('golden_pool').select('id, engine, machine').eq('language', language).limit(5000);
  if (error) throw new Error(`golden_pool read failed: ${error.message}`);
  if (!pool?.length) return null;
  const { data: mine } = await sb.from('golden_labels').select('pool_id').eq('labeler', labeler).limit(10000);
  const done = new Set((mine ?? []).map((r: any) => r.pool_id));
  const { data: all } = await sb.from('golden_labels').select('pool_id').limit(20000);
  const labelCount = new Map<string, number>();
  for (const r of all ?? []) labelCount.set(r.pool_id, (labelCount.get(r.pool_id) ?? 0) + 1);
  const strata = new Map<string, { labeled: number; open: any[] }>();
  for (const it of pool) {
    const k = `${it.engine}|${it.machine?.brandMentioned ? 1 : 0}`;
    const st = strata.get(k) ?? { labeled: 0, open: [] };
    if (labelCount.has(it.id)) st.labeled++;
    if (!done.has(it.id)) st.open.push(it);
    strata.set(k, st);
  }
  const candidates = [...strata.values()].filter((s) => s.open.length).sort((a, b) => a.labeled - b.labeled);
  if (!candidates.length) return null;
  const pick = candidates[0].open[Math.floor(Math.random() * candidates[0].open.length)];
  const { data: item } = await sb.from('golden_pool')
    .select('id, language, engine, model, stage, intent, key_prompt, prompt, answer_text, brand_name, competitor_names')
    .eq('id', pick.id).single();
  return item ?? null;
}

// ── agreement ───────────────────────────────────────────────────────────────

export function kappa(pairs: [string, string][]): number | null {
  const n = pairs.length; if (!n) return null;
  const cats = Array.from(new Set(pairs.flat()));
  let agree = 0; const pa: Record<string, number> = {}, pb: Record<string, number> = {};
  for (const [a, b] of pairs) { if (a === b) agree++; pa[a] = (pa[a] ?? 0) + 1; pb[b] = (pb[b] ?? 0) + 1; }
  const po = agree / n;
  const pe = cats.reduce((s, c) => s + ((pa[c] ?? 0) / n) * ((pb[c] ?? 0) / n), 0);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a.map((x) => x.toLowerCase())), B = new Set(b.map((x) => x.toLowerCase()));
  if (!A.size && !B.size) return 1;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};

export interface AgreementReport {
  n: number;
  brandMentioned: { accuracy: number; kappa: number | null };
  prominence: { exact: number; within1: number; judgedN: number };
  sentiment: { accuracy: number; kappa: number | null; judgedN: number };
  competitors: { meanJaccard: number };
}

/** machine vs human on the same items. Prominence/sentiment are compared only
 *  where the machine actually judged (`judged: true`); string-fallback rows
 *  would measure the fallback, not the judge. */
export function agreement(rows: { machine: any; label: Label }[]): AgreementReport {
  const n = rows.length;
  const bm = rows.map((r) => [String(!!r.machine?.brandMentioned), String(!!r.label.brand_mentioned)] as [string, string]);
  const judged = rows.filter((r) => r.machine?.judged && r.machine?.prominence != null);
  const promExact = judged.filter((r) => Number(r.machine.prominence) === Number(r.label.prominence)).length;
  const promWithin1 = judged.filter((r) => Math.abs(Number(r.machine.prominence) - Number(r.label.prominence)) <= 1).length;
  const sent = judged.map((r) => [String(r.machine.sentiment), String(r.label.sentiment)] as [string, string]);
  const jac = rows.map((r) => jaccard(r.machine?.competitors ?? [], r.label.competitors ?? []));
  return {
    n,
    brandMentioned: { accuracy: n ? bm.filter(([a, b]) => a === b).length / n : 0, kappa: kappa(bm) },
    prominence: { exact: judged.length ? promExact / judged.length : 0, within1: judged.length ? promWithin1 / judged.length : 0, judgedN: judged.length },
    sentiment: { accuracy: sent.length ? sent.filter(([a, b]) => a === b).length / sent.length : 0, kappa: kappa(sent), judgedN: sent.length },
    competitors: { meanJaccard: n ? jac.reduce((a, b) => a + b, 0) / n : 0 },
  };
}
