#!/usr/bin/env node
// Turn suggested actions in the Lark group on or off for one project
// (projects.metadata.larkSuggestedActions — lib/lark-bot.ts, off by default).
//   node scripts/set-lark-suggestions.mjs <projectId|projectSlug> <on|off> [--auto on|off]
// On: "@bot /xacnhan <n>" and the card buttons confirm suggestions for the sender.
// --auto on: after each scan's page fetch, NEW suggestions are posted to the group
// automatically as an interactive card (projects.metadata.larkSuggestionsAutoPost);
// without it, posting is a separate send (scripts/post-suggestions-card.ts).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV = join(REPO, '.env.local');
if (existsSync(ENV)) {
  for (const raw of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('='); if (i < 0) continue;
    const k = l.slice(0, i).trim(); let v = l.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

const [, , project, state] = process.argv;
const autoAt = process.argv.indexOf('--auto');
const auto = autoAt >= 0 ? process.argv[autoAt + 1] : null;
if (!project || !['on', 'off'].includes(state || '') || (auto !== null && !['on', 'off'].includes(auto))) {
  console.error('Usage: node scripts/set-lark-suggestions.mjs <projectId|projectSlug> <on|off> [--auto on|off]');
  process.exit(1);
}

const pg = await import('pg');
const c = new pg.default.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// One statement, so a digest or scan writing metadata at the same moment is not overwritten.
// A slug can repeat across organisations: more than one match changes nothing.
await c.query('BEGIN');
const r = await c.query(
  `UPDATE projects
     SET metadata = jsonb_set(jsonb_set(coalesce(metadata,'{}'::jsonb), '{larkSuggestedActions}', to_jsonb($1::boolean), true),
                              '{larkSuggestionsAutoPost}', to_jsonb(coalesce($3::boolean, (coalesce(metadata,'{}'::jsonb)->>'larkSuggestionsAutoPost')::boolean, false)), true)
   WHERE id::text = $2 OR slug = $2
   RETURNING id, slug, brand_name, metadata->>'larkSuggestedActions' AS lark_suggested_actions`,
  [state === 'on', project, auto === null ? null : auto === 'on'],
);
if (r.rowCount !== 1) {
  await c.query('ROLLBACK');
  console.error(r.rowCount ? `"${project}" matches ${r.rowCount} projects — use the project id. Nothing changed.` : `No project "${project}". Nothing changed.`);
  await c.end();
  process.exit(1);
}
await c.query('COMMIT');
const bound = await c.query('SELECT count(*)::int AS n FROM lark_bindings WHERE project_id = $1', [r.rows[0].id]);
console.table(r.rows);
console.log(bound.rows[0].n ? `Bound Lark groups: ${bound.rows[0].n}` : 'No Lark group is bound to this project yet (@bot /bind <slug>).');
await c.end();
