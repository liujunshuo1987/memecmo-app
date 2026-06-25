#!/usr/bin/env node
// One-shot admin bootstrap.
//
// Run this AFTER you've signed up on app.memecmo.ai (or whichever Vercel URL)
// with your founder email. It will:
//
//   1. Locate your auth.users row by email
//   2. Add you as ADMIN of the 'memecmo' root org (idempotent)
//   3. Flip 'fmvn' from pending_approval → active (idempotent)
//   4. Create FMVN's first project: 'fmvn/vietnam-2026' (idempotent)
//
// Usage:
//   node scripts/admin-bootstrap.mjs [email]
//
// Defaults to liujunshuo1987@gmail.com if no email given.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(__filename);
const REPO_DIR = dirname(SCRIPT_DIR);
const ENV_FILE = join(REPO_DIR, '.env.local');

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotenv(ENV_FILE);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || DATABASE_URL.includes('<password>')) {
  console.error('❌ DATABASE_URL not set in .env.local');
  process.exit(1);
}

const FOUNDER_EMAIL = process.argv[2] || 'liujunshuo1987@gmail.com';
console.log(`→ Bootstrapping with email: ${FOUNDER_EMAIL}`);

const pg = await import('pg');
const { Client } = pg.default;
const c = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

try {
  // 1. Find the user
  const { rows: users } = await c.query(
    'SELECT id, email, created_at FROM auth.users WHERE email = $1 LIMIT 1',
    [FOUNDER_EMAIL],
  );
  if (users.length === 0) {
    console.error(`❌ No auth.users row for ${FOUNDER_EMAIL}.`);
    console.error('   Sign up on app.memecmo.ai (or the Vercel URL) first, then re-run this.');
    process.exit(1);
  }
  const user = users[0];
  console.log(`✓ Found user ${user.id} (created ${user.created_at})`);

  // 2. Get MemeCMO root org id
  const { rows: orgRows } = await c.query(
    "SELECT id FROM public.organizations WHERE slug = 'memecmo' LIMIT 1",
  );
  if (orgRows.length === 0) {
    console.error("❌ 'memecmo' root org not found. Did the workspace migration run?");
    process.exit(1);
  }
  const memecmoOrgId = orgRows[0].id;

  // 3. Add as admin (idempotent)
  await c.query(
    `INSERT INTO public.organization_members (organization_id, user_id, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin'`,
    [memecmoOrgId, user.id],
  );
  console.log(`✓ User is admin of 'memecmo' root org`);

  // 4. Activate FMVN
  const { rows: fmvnRows } = await c.query(
    `UPDATE public.organizations
     SET status = 'active', billing_email = COALESCE(billing_email, $1)
     WHERE slug = 'fmvn' AND status = 'pending_approval'
     RETURNING id, status`,
    [FOUNDER_EMAIL],
  );
  let fmvnId;
  if (fmvnRows.length === 0) {
    const { rows } = await c.query("SELECT id, status FROM public.organizations WHERE slug = 'fmvn'");
    fmvnId = rows[0]?.id;
    console.log(`⊘ 'fmvn' org already ${rows[0]?.status} — skipped`);
  } else {
    fmvnId = fmvnRows[0].id;
    console.log(`✓ 'fmvn' activated`);
  }

  // 5. Make the founder admin of FMVN too (so MemeCMO can demo / QA inside FMVN's workspace)
  if (fmvnId) {
    await c.query(
      `INSERT INTO public.organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin'`,
      [fmvnId, user.id],
    );
    console.log(`✓ User is admin of 'fmvn' (channel partner)`);
  }

  // 6. Create FMVN-Vietnam project
  const { rows: existingProj } = await c.query(
    "SELECT id, slug FROM public.projects WHERE organization_id = $1 AND slug = 'vietnam-2026'",
    [fmvnId],
  );
  if (existingProj.length > 0) {
    console.log(`⊘ Project 'fmvn/vietnam-2026' already exists`);
  } else {
    const { rows: newProj } = await c.query(
      `INSERT INTO public.projects (
         organization_id, slug, brand_name, brand_url, target_country, target_language,
         industry, description, created_by, status
       ) VALUES ($1, 'vietnam-2026', $2, $3, 'Vietnam', 'vi', $4, $5, $6, 'active')
       RETURNING id`,
      [
        fmvnId,
        'Focus Media Vietnam',
        'https://focusmedia.vn',
        'Elevator media / OOH digital signage',
        'First MemeCMO × FMVN GEO engagement. USD 40k, 6 months. Target market: Vietnam SMBs and brand campaign buyers.',
        user.id,
      ],
    );
    console.log(`✓ Created project 'fmvn/vietnam-2026' (${newProj[0].id})`);
  }

  console.log('');
  console.log('🎉 Bootstrap complete.');
  console.log('   → Open: https://app.memecmo.ai/workspace/fmvn/vietnam-2026');
  console.log('   → Or locally: http://localhost:3000/workspace/fmvn/vietnam-2026');
} finally {
  await c.end();
}
