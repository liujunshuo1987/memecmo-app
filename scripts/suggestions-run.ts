// Run suggested-action detection for one project now, instead of waiting for the
// page fetch that follows the next scan — the same steps as the end of the
// pages-fetch function (lib/inngest/functions.ts): read the brand's own pages
// the fetcher has not read yet, then detect and store.
//   NODE_USE_ENV_PROXY=1 npx tsx --tsconfig tsconfig.json scripts/suggestions-run.ts <projectId> [--days 45]
// WRITES to production: geo_pages (the pages it reads) and
// intervention_suggestions (pending rows the client team will see). It sends
// nothing. --days widens the window for a one-off backfill.
// Credentials are read from .env.local (parsed here, never sourced).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { DETECT_WINDOW_DAYS, detectSuggestions, loadDetectionInput, loadPendingSuggestions, runDetection } from '../lib/suggestions';
import { fetchBatch } from '../lib/pages/queue';
import { domainOf } from '../lib/interventions';

function envFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--days');
  const windowDays = at >= 0 ? Number(args[at + 1]) : DETECT_WINDOW_DAYS;
  const projectId = args.find((a, i) => !a.startsWith('--') && i !== at + 1);
  if (!projectId || !(windowDays > 0)) { console.error('Usage: suggestions-run.ts <projectId> [--days 45]'); process.exit(1); }
  const env = envFile(join(__dirname, '..', '.env.local'));
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Own pages inside this window that nobody has read: at most 4 rounds of 24, one polite crawler.
  for (let round = 0; round < 4; round++) {
    const { unread } = detectSuggestions(await loadDetectionInput(sb, projectId, { windowDays }));
    if (!unread.length) break;
    const batch = unread.slice(0, 24).map((u) => ({ url: u.url, domain: domainOf(u.url) ?? '', cites: u.cites }));
    const r = await fetchBatch(sb, batch);
    console.log(`read ${r.fetched} own pages (${r.ok} ok, ${r.failed + r.skipped + r.blocked} not readable) · ${Math.max(0, unread.length - batch.length)} still unread`);
    if (!r.fetched) break;
  }
  const done = await runDetection(sb, projectId, { windowDays });
  console.log(`window ${windowDays} days · added ${done.added} · closed against hand-logged actions ${done.closed}`);
  const pending = await loadPendingSuggestions(sb, projectId);
  console.log(`\npending now: ${pending.length}`);
  for (const s of pending) console.log(`  #${s.seq}  ${s.published_guess} (${s.guess_source}) · cited ${s.evidence?.cites ?? 0}× · ${s.url}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
