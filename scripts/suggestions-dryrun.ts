// Read-only dry run of suggested-action detection (lib/suggestions.ts): prints
// what WOULD be suggested for one project and what each rule left out. Writes
// nothing — it only selects, and works before the migration is applied.
//   NODE_USE_ENV_PROXY=1 npx tsx --tsconfig tsconfig.json scripts/suggestions-dryrun.ts [projectId] [--days 45] [--fetch-unread]
// --fetch-unread also reads, in memory, the own pages the fetcher has not read
// yet (as the production step does before detecting, 24 per run) — the same
// polite fetcher, robots.txt honoured, nothing stored.
// Credentials are read from .env.local (parsed here, never sourced).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { DETECT_WINDOW_DAYS, detectSuggestions, loadDetectionInput } from '../lib/suggestions';
import { fetchPage } from '../lib/pages/fetch';

const FMVN = 'f8f77dd4-a9ee-4828-8de1-2f317ad88392';

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
  const projectId = args.find((a, i) => !a.startsWith('--') && i !== at + 1) ?? FMVN;
  const env = envFile(join(__dirname, '..', '.env.local'));
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const input = await loadDetectionInput(sb, projectId, { windowDays, preMigration: true });
  let r = detectSuggestions(input);
  if (args.includes('--fetch-unread') && r.unread.length) {
    console.log(`reading ${r.unread.length} own pages the fetcher has not read yet…`);
    for (const u of r.unread) {
      const f = await fetchPage(u.url);
      input.pages.push({ url: u.url, ok: f.ok, title: f.title, canonical: f.canonical, finalUrl: f.finalUrl, textHash: f.textHash, wordCount: f.wordCount, publishedAt: f.publishedAt, firstSeenAt: new Date().toISOString() });
      await new Promise((res) => setTimeout(res, 700));
    }
    r = detectSuggestions(input);
  }
  console.log(`project ${projectId} · own hosts ${input.ownHosts.join(', ')} · window ${windowDays} days`);
  console.log(`read: ${input.discovered.length} discovered pages · ${input.pages.length} fetched pages · ${input.cited.length} cited own urls · first scan ${input.firstScanAt?.slice(0, 10) ?? '–'} · ${input.loggedUrls.length} logged actions`);
  console.log(`\nWOULD SUGGEST ${r.suggestions.length}:`);
  r.suggestions.forEach((s, i) => {
    const e = s.evidence;
    console.log(`\n#${i + 1}  ${s.title ?? '(no title)'}`);
    console.log(`    ${s.url}`);
    console.log(`    publish-date guess ${s.publishedGuess} (${s.guessSource}) · first seen ${e.firstSeenAt.slice(0, 10)} · discovered ${e.discoveredAt?.slice(0, 10) ?? '–'} · first cited ${e.firstCitedAt?.slice(0, 10) ?? '–'} · cited ${e.cites}× (${e.engines.join(', ') || '–'}) · ${e.words ?? '–'} words`);
    console.log(`    targets: ${s.targetCandidates.length ? s.targetCandidates.map((c) => `Q${c.n}${c.strong ? '*' : ''} (${c.shared} words)`).join(' · ') : '–'}`);
    if (e.aliases.length) console.log(`    also seen as: ${e.aliases.join(' · ')}`);
  });
  console.log(`\n(* = pre-selected on confirm)\n\nLEFT OUT — known before the window: ${r.seenBeforeWindow} pages`);
  for (const [why, urls] of Object.entries(r.skipped)) {
    if (urls.length) console.log(`LEFT OUT — ${why}: ${urls.length}\n${urls.map((u) => `    ${u}`).join('\n')}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
