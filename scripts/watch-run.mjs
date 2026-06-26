// Watch the latest agent_run for a project and report execution-layer truth.
//
// Usage: node scripts/watch-run.mjs [projectSlug] [orgSlug]
// Defaults to fmvn / vietnam-2026.
//
// Connects with the service-role key (bypasses RLS) so we see exactly what the
// Inngest worker wrote, independent of the browser/auth layer. Polls every 2s
// until the run reaches a terminal state or ~3 min elapse.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// --- load .env.local without extra deps ---
const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const orgSlug = process.argv[3] || 'fmvn';
const projectSlug = process.argv[2] || 'vietnam-2026';

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Resolve project id
const { data: org } = await sb.from('organizations').select('id').eq('slug', orgSlug).single();
if (!org) { console.error(`org ${orgSlug} not found`); process.exit(1); }
const { data: project } = await sb
  .from('projects')
  .select('id, brand_name, slug')
  .eq('organization_id', org.id)
  .eq('slug', projectSlug)
  .single();
if (!project) { console.error(`project ${orgSlug}/${projectSlug} not found`); process.exit(1); }

console.log(`▶ Watching ${orgSlug}/${projectSlug} (${project.brand_name}) — project ${project.id}\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRunId = null;
let seenEvents = 0;

for (let i = 0; i < 90; i++) {
  // newest run on this project
  const { data: run } = await sb
    .from('agent_runs')
    .select('id, agent_id, status, progress_pct, error_message, created_at, started_at, completed_at')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) {
    if (i % 5 === 0) console.log('… no runs yet. Click an agent in the workspace.');
    await sleep(2000);
    continue;
  }

  if (run.id !== lastRunId) {
    lastRunId = run.id;
    seenEvents = 0;
    console.log(`\n=== RUN ${run.id}  agent=${run.agent_id}  created=${run.created_at} ===`);
  }

  const { data: events } = await sb
    .from('agent_run_events')
    .select('ts, event_type, payload')
    .eq('agent_run_id', run.id)
    .order('ts', { ascending: true });

  const ev = events ?? [];
  for (let j = seenEvents; j < ev.length; j++) {
    const e = ev[j];
    const p = e.payload || {};
    const label = p.label || p.message || p.name || p.text || '';
    console.log(`  [${e.event_type}] ${typeof label === 'string' ? label.slice(0, 90) : ''}`);
  }
  seenEvents = ev.length;

  const terminal = ['completed', 'failed', 'canceled'].includes(run.status);
  process.stdout.write(`  → status=${run.status} progress=${run.progress_pct ?? 0}% events=${ev.length}${run.error_message ? ' ERR=' + run.error_message : ''}\n`);

  if (terminal) {
    console.log(`\n✔ Terminal: ${run.status} after ${ev.length} events.`);
    if (run.error_message) console.log(`  error_message: ${run.error_message}`);
    process.exit(run.status === 'completed' ? 0 : 2);
  }

  await sleep(2000);
}

console.log('\n⏱ Timed out after ~3 min without a terminal state.');
process.exit(3);
