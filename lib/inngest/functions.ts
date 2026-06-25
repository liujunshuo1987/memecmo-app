// Inngest functions — the actual background workers.

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { inngest } from './client';
import { executeAgentRun } from '@/lib/agents/run';

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Handles 'agent/run.requested' — runs the requested agent end-to-end.
// concurrency + retries are configured here; step-level durability comes
// for free for any step.run() we add inside the agents later (v0.6 monitor).
export const runAgent = inngest.createFunction(
  {
    id: 'run-agent',
    name: 'Run GEO agent',
    // Cap parallel agent runs so a burst doesn't exhaust LLM rate limits.
    concurrency: { limit: 5 },
    retries: 2,
    // Inngest v4: the trigger lives inside the options object.
    triggers: [{ event: 'agent/run.requested' }],
  },
  async ({ event, step }) => {
    const { runId, agentId, projectId } = event.data;
    const sb = svc();

    // 1. Load project (service role — Inngest has no user session)
    const project = await step.run('load-project', async () => {
      const { data, error } = await sb
        .from('projects')
        .select('id, brand_name, brand_url, target_country, target_language, industry')
        .eq('id', projectId)
        .single();
      if (error || !data) throw new Error(`Project ${projectId} not found: ${error?.message}`);
      return data;
    });

    // 2. Mark running (idempotent: only flips from queued)
    await step.run('mark-running', async () => {
      await sb
        .from('agent_runs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', runId)
        .eq('status', 'queued');
      return true;
    });

    // 3. Execute the agent. executeAgentRun persists events to DB and
    //    finalizes status (completed/failed) + assets. The emit callback is a
    //    no-op here because the UI observes via DB polling, not a live stream.
    //
    //    NOTE: for v0.5 the whole agent runs in one step. In v0.6 the monitor
    //    agent will split into per-engine step.run() calls so a failure at
    //    engine 3 of 4 resumes from there instead of re-running everything.
    await executeAgentRun(runId, agentId, project, async () => {});

    return { runId, agentId, status: 'done' };
  },
);

export const functions = [runAgent];
