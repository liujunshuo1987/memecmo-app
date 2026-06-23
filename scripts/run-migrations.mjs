#!/usr/bin/env node
// One-shot migration runner — pure Node, no psql needed.
//
// Reads DATABASE_URL from .env.local (or env), runs every SQL file in
// supabase/migrations/ in lexical order, tracks applied files in a
// public.__migrations table so re-runs only apply new migrations.
//
// Usage: ./scripts/run-migrations.mjs  (or:  node scripts/run-migrations.mjs)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(__filename);
const REPO_DIR = dirname(SCRIPT_DIR);
const MIGRATIONS_DIR = join(REPO_DIR, 'supabase', 'migrations');
const ENV_FILE = join(REPO_DIR, '.env.local');

// ─── Load .env.local manually (no dotenv dep needed) ─────────────────────────
function loadDotenv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip optional quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotenv(ENV_FILE);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || DATABASE_URL.includes('<password>') || DATABASE_URL.includes('<ref>')) {
  console.error('❌ DATABASE_URL is missing or still has placeholder text.');
  console.error('   Edit .env.local and put the Supabase Direct → Connection string there.');
  process.exit(1);
}

// ─── Dynamic import pg (auto-install if missing) ─────────────────────────────
let pg;
try {
  pg = await import('pg');
} catch {
  console.log('→ pg module not found, installing…');
  const { execSync } = await import('node:child_process');
  execSync('npm install pg --no-save --silent', { cwd: REPO_DIR, stdio: 'inherit' });
  pg = await import('pg');
}
const { Client } = pg.default;

// ─── Connect ─────────────────────────────────────────────────────────────────
console.log('→ Connecting to Supabase…');
const client = new Client({
  connectionString: DATABASE_URL,
  // Supabase pooler requires SSL but with self-signed cert
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('✓ Connected.\n');
} catch (err) {
  console.error('❌ Connection failed:', err.message);
  process.exit(1);
}

// ─── Bootstrap tracking table ────────────────────────────────────────────────
await client.query(`
  CREATE TABLE IF NOT EXISTS public.__migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const { rows: appliedRows } = await client.query(
  'SELECT filename FROM public.__migrations ORDER BY filename'
);
const applied = new Set(appliedRows.map((r) => r.filename));

// ─── Discover migration files ────────────────────────────────────────────────
if (!existsSync(MIGRATIONS_DIR)) {
  console.error(`❌ Migrations directory not found: ${MIGRATIONS_DIR}`);
  process.exit(1);
}
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

// ─── Apply migrations ────────────────────────────────────────────────────────
let appliedCount = 0;
let skippedCount = 0;
let failed = null;

for (const file of files) {
  if (applied.has(file)) {
    console.log(`⊘ Skipping (already applied): ${file}`);
    skippedCount++;
    continue;
  }
  console.log(`→ Applying: ${file}`);
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO public.__migrations (filename) VALUES ($1)',
      [file]
    );
    await client.query('COMMIT');
    console.log(`✓ Applied: ${file}`);
    appliedCount++;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`❌ FAILED: ${file}`);
    console.error('   ' + (err.message || err));
    failed = file;
    break;
  }
}

await client.end();

console.log('\n─── Summary ───');
console.log(`Applied : ${appliedCount}`);
console.log(`Skipped : ${skippedCount}`);
if (failed) {
  console.log(`Failed  : ${failed}`);
  console.log('\nMigration stopped on first failure. Fix the SQL file and re-run.');
  process.exit(1);
}
console.log('All good. ✅');
