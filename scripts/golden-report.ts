// Golden-set agreement report: machine judge vs human labels, per language.
//   npx tsx --env-file=.env.local scripts/golden-report.ts [--labeler email] [--exclude smoke]
import { createClient } from '@supabase/supabase-js';
import { agreement } from '../lib/golden';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
async function main() {
  // Network on the dev machine drops connections; a null `data` without a
  // printed error once read as "0 labels". Retry, and never swallow the error.
  let data: any[] | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await sb.from('golden_labels').select('labeler, brand_mentioned, prominence, sentiment, competitors, seconds, golden_pool(language, engine, machine)').limit(20000);
    if (!res.error && res.data) { data = res.data; break; }
    console.error(`query attempt ${attempt} failed: ${res.error?.message ?? 'no data'}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  if (!data) { console.error('could not read golden_labels'); process.exit(1); }
  const only = arg('--labeler'), excl = arg('--exclude');
  const rows = (data ?? []).filter((r: any) => (!only || r.labeler === only) && (!excl || !String(r.labeler).includes(excl)));
  const byLang: Record<string, { machine: any; label: any }[]> = {};
  for (const r of rows as any[]) (byLang[r.golden_pool.language] ??= []).push({ machine: r.golden_pool.machine, label: r });
  const pct = (x: number | null | undefined) => (x == null ? '—' : (100 * x).toFixed(0) + '%');
  console.log(`labels: ${rows.length} · labelers: ${[...new Set((rows as any[]).map((r) => r.labeler))].join(', ') || '—'}`);
  for (const [lang, rs] of Object.entries(byLang)) {
    const a = agreement(rs);
    const secs = rs.map((r) => Number(r.label.seconds)).filter((s) => s > 0).sort((x, y) => x - y);
    console.log(`[${lang}] n=${a.n} · brandMentioned acc ${pct(a.brandMentioned.accuracy)} κ ${a.brandMentioned.kappa?.toFixed(2) ?? '—'} · prominence exact ${pct(a.prominence.exact)} ±1 ${pct(a.prominence.within1)} (judged ${a.prominence.judgedN}) · sentiment acc ${pct(a.sentiment.accuracy)} κ ${a.sentiment.kappa?.toFixed(2) ?? '—'} · competitors Jaccard ${a.competitors.meanJaccard.toFixed(2)}${secs.length ? ` · median ${Math.round(secs[Math.floor(secs.length / 2)])}s/label` : ''}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
