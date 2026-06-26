// One-shot: insert a queued agent_run for fmvn/vietnam-2026 and fire the
// Inngest event that the production worker consumes. Tests the real execution
// path (Inngest Cloud → prod /api/inngest → runAgent → executeAgentRun → DB),
// bypassing only the browser + auth layer.
//
// Usage: node scripts/trigger-test-run.mjs [agentId]   (default: discovery)

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { Inngest } from 'inngest';

function loadEnv(file) {
  const out = {};
  try {
    for (const line of readFileSync(new URL(file, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
  return out;
}

const local = loadEnv('../.env.local');
const prod = loadEnv('../.env.vercel.prod'); // for INNGEST_EVENT_KEY

const agentId = process.argv[2] || 'discovery';

const sb = createClient(local.NEXT_PUBLIC_SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Resolve fmvn / vietnam-2026
const { data: org } = await sb.from('organizations').select('id').eq('slug', 'fmvn').single();
const { data: project } = await sb
  .from('projects')
  .select('id, brand_name')
  .eq('organization_id', org.id)
  .eq('slug', 'vietnam-2026')
  .single();

// Insert a queued run (mirrors what POST /api/workspace/agent-runs does)
const { data: run, error } = await sb
  .from('agent_runs')
  .insert({
    project_id: project.id,
    agent_id: agentId,
    trigger_method: 'api',
    input_prompt: '[automated execution-layer test]',
    status: 'queued',
  })
  .select('id')
  .single();
if (error) { console.error('insert failed:', error.message); process.exit(1); }

console.log(`Inserted queued run ${run.id} (agent=${agentId}, project=${project.brand_name})`);

// Fire the event to Inngest Cloud — picked up by the production deployment.
const inngest = new Inngest({ id: 'memecmo-app', eventKey: prod.INNGEST_EVENT_KEY });
const res = await inngest.send({
  name: 'agent/run.requested',
  data: { runId: run.id, agentId, projectId: project.id },
});
console.log('Inngest event sent:', JSON.stringify(res));
console.log(`\nNow watching… (or run: node scripts/watch-run.mjs)`);
