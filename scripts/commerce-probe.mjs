#!/usr/bin/env node
// Verify commercial entities + backfill subscriptions for existing end_client orgs.
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
const pg = await import('pg');
const c = new pg.default.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const plans = await c.query('SELECT id, name, monthly_scan_quota, max_projects FROM plans ORDER BY sort');
console.log('PLANS:'); console.table(plans.rows);

const orgs = await c.query("SELECT id, name, type, status FROM organizations ORDER BY type, name");
console.log('ORGS:'); console.table(orgs.rows.map(o => ({ name: o.name, type: o.type, status: o.status })));

// Backfill: every end_client gets a trialing 'standard' subscription if missing.
const bf = await c.query(`
  INSERT INTO org_subscriptions (organization_id, plan_id, status)
  SELECT o.id, 'standard', 'trialing' FROM organizations o
  WHERE o.type = 'end_client'
    AND NOT EXISTS (SELECT 1 FROM org_subscriptions s WHERE s.organization_id = o.id)
  RETURNING organization_id, plan_id`);
console.log(`Backfilled ${bf.rowCount} end_client subscription(s).`);

const subs = await c.query(`
  SELECT o.name, s.plan_id, s.status, s.current_period_end
  FROM org_subscriptions s JOIN organizations o ON o.id = s.organization_id ORDER BY o.name`);
console.log('SUBSCRIPTIONS:'); console.table(subs.rows);

const usage = await c.query('SELECT count(*)::int AS events FROM usage_events');
console.log('USAGE EVENTS so far:', usage.rows[0].events);

await c.end();
