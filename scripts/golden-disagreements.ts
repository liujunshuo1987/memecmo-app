// Show items where a human label disagrees with the machine judge — the raw
// material for understanding WHAT the judge gets wrong (alias? URL-only
// mention? position?), not just how often.
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data, error } = await sb.from('golden_labels').select('labeler, brand_mentioned, prominence, sentiment, competitors, golden_pool(engine, prompt, brand_name, answer_text, machine)').order('labeled_at');
  if (error) throw error;
  let shown = 0;
  for (const r of (data ?? []) as any[]) {
    const m = r.golden_pool.machine; const p = r.golden_pool;
    const diffs: string[] = [];
    if (!!m.brandMentioned !== r.brand_mentioned) diffs.push(`mentioned machine=${!!m.brandMentioned} human=${r.brand_mentioned}`);
    if (m.judged && m.prominence != null && Number(m.prominence) !== Number(r.prominence)) diffs.push(`prominence machine=${m.prominence} human=${r.prominence}`);
    if (m.judged && m.sentiment && m.sentiment !== r.sentiment) diffs.push(`sentiment machine=${m.sentiment} human=${r.sentiment}`);
    const mc = new Set((m.competitors ?? []).map((x: string) => x.toLowerCase())), hc = new Set((r.competitors ?? []).map((x: string) => x.toLowerCase()));
    const onlyM = [...mc].filter((x) => !hc.has(x)), onlyH = [...hc].filter((x) => !mc.has(x));
    if (onlyM.length || onlyH.length) diffs.push(`competitors machine-only=[${onlyM}] human-only=[${onlyH}]`);
    if (!diffs.length) continue;
    shown++;
    const text: string = p.answer_text;
    const variants = [String(p.brand_name), ...String(p.brand_name).split(/\s+/).filter((x: string) => x.length >= 3)];
    let i = -1; for (const v of variants) { i = text.toLowerCase().indexOf(v.toLowerCase()); if (i >= 0) break; }
    const ctx = i >= 0 ? text.slice(Math.max(0, i - 80), i + 120).replace(/\s+/g, ' ') : '(brand name string not found in text)';
    console.log(`\n[${p.engine}] "${String(p.prompt).slice(0, 60)}"\n  ${diffs.join(' · ')}\n  around brand: …${ctx}…`);
  }
  console.log(`\n${shown} of ${data?.length ?? 0} labelled items disagree with the machine somewhere.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
