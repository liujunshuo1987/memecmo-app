#!/usr/bin/env node
// Opt a project into scheduled reporting cadence (FMVN §4.5).
//   node scripts/set-reporting.mjs <projectSlug> <weekly|monthly|off>
// The weekly/monthly Inngest crons only act on projects flagged here, AND only
// when SCHEDULED_SCANS_ENABLED=1 is set in the environment.
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

const [, , slug, cadence] = process.argv;
if (!slug || !['weekly', 'monthly', 'off'].includes(cadence || '')) {
  console.error('Usage: node scripts/set-reporting.mjs <projectSlug> <weekly|monthly|off>');
  process.exit(1);
}

const pg = await import('pg');
const c = new pg.default.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const value = cadence === 'off' ? 'off' : cadence;
const r = await c.query(
  `UPDATE projects
     SET metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{reporting}', to_jsonb($1::text), true)
   WHERE slug = $2
   RETURNING slug, brand_name, metadata->>'reporting' AS reporting`,
  [value, slug],
);
if (!r.rowCount) console.error(`No project with slug "${slug}".`);
else console.table(r.rows);
await c.end();
