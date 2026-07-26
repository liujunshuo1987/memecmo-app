// Operator dry-run: compose the client digest for the scan-richest project and
// write the HTML to $OUT. Configures language/kickoff only — never recipients.
import { createClient } from '@supabase/supabase-js';
import { previewProjectDigest } from '../lib/reports/digest';
import * as fs from 'fs';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: projects } = await sb.from('projects').select('id, slug, brand_name, target_country, metadata').eq('status', 'active');
  const ranked: any[] = [];
  for (const p of projects ?? []) {
    const { count } = await sb.from('agent_runs').select('id', { count: 'exact', head: true })
      .eq('project_id', p.id).in('agent_id', ['monitor', 'full_scan']).eq('status', 'completed');
    ranked.push({ ...p, scans: count ?? 0 });
  }
  ranked.sort((a, b) => b.scans - a.scans);
  console.log(ranked.map((p) => `${p.brand_name} · ${p.target_country} · scans=${p.scans}`).join('\n'));
  const target = ranked[0];

  const metadata = { ...(target.metadata || {}), reportSchedule: { ...(target.metadata?.reportSchedule || {}), language: 'zh', kickoffAt: '2026-07-01T00:00:00Z', stageOverride: process.env.STAGE || undefined } };
  await sb.from('projects').update({ metadata }).eq('id', target.id);

  const t0 = Date.now();
  const preview = await previewProjectDigest(sb as any, target.id);
  if (!preview) throw new Error('no preview');
  console.log(`\nstage=${preview.stage} subject="${preview.subject}" (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  fs.writeFileSync(process.env.OUT!, preview.html);
  console.log('written:', process.env.OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
