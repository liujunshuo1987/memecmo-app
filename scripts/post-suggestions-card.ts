// Post the pending suggested actions of one project to its Lark group as the
// interactive card (one-tap confirm / dismiss). Writes lark_posted_at /
// lark_message_id on the rows it posts. Sends ONE message to the client's group.
//   NODE_USE_ENV_PROXY=1 npx tsx --tsconfig tsconfig.json scripts/post-suggestions-card.ts <projectId> --approved-by <email> [--all]
// Without --all only rows never posted before are sent (same as the automatic post).
// Credentials are read from .env.local (parsed here, never sourced).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { postSuggestionCard } from '../lib/lark-bot';

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
  const projectId = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--approved-by');
  const at = args.indexOf('--approved-by');
  const approvedBy = at >= 0 ? String(args[at + 1] || '') : '';
  if (!projectId || !approvedBy) { console.error('usage: post-suggestions-card.ts <projectId> --approved-by <email> [--all]'); process.exit(1); }
  const env = { ...envFile(join(process.cwd(), '.env.local')), ...process.env };
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LARK_APP_ID', 'LARK_APP_SECRET']) if (!env[k]) { console.error(`missing ${k}`); process.exit(1); }
  for (const k of Object.keys(env)) if (!(k in process.env)) process.env[k] = env[k];
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const out = await postSuggestionCard(sb, { projectId, approvedBy, onlyNew: !args.includes('--all') });
  console.log(out);
}
main().catch((e) => { console.error(e); process.exit(1); });
