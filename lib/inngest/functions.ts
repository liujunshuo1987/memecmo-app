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

    // 3. Execute the agent. `step` is passed through so long cascades
    //    (full_scan) checkpoint each phase as its own Inngest step → each runs
    //    in a separate, short Vercel invocation and resumes durably, instead of
    //    one long invocation that hits the function-duration ceiling and stalls.
    await executeAgentRun(runId, agentId, project, async () => {}, step);

    return { runId, agentId, status: 'done' };
  },
);

export const functions = [runAgent];
