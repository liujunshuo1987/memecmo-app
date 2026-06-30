// Inngest functions — the actual background workers.

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { inngest } from './client';
import { executeAgentRun } from '@/lib/agents/run';
import { recordUsage, isMeteredKind } from '@/lib/commerce';

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Scheduled cadence (FMVN §4.5 / E2 / M4-M5) ───────────────────────────────
// Weekly re-measure + monthly report & competitor patrol. Gated twice so it
// never burns credits unintentionally:
//   1. global kill-switch  SCHEDULED_SCANS_ENABLED=1
//   2. per-project opt-in   projects.metadata.reporting ∈ {'weekly','monthly'}
// Scheduled runs are metered (visibility) but NEVER quota-blocked — they are
// the contracted deliverable, not client-initiated usage.

function schedulingEnabled(): boolean {
  return process.env.SCHEDULED_SCANS_ENABLED === '1';
}

// Active projects (with active org) opted into one of the given cadences.
async function listScheduledProjects(cadences: string[]): Promise<{ id: string; organization_id: string }[]> {
  const sb = svc();
  const { data } = await sb
    .from('projects')
    .select('id, organization_id, metadata, status, organizations!inner(status)')
    .eq('status', 'active')
    .in('metadata->>reporting', cadences);
  return (data ?? [])
    .filter((p: any) => p.organizations?.status === 'active')
    .map((p: any) => ({ id: p.id, organization_id: p.organization_id }));
}

// Insert a queued run + hand off to Inngest, exactly like the HTTP endpoint but
// server-side (no quota gate). Returns the new run id, or null on failure.
async function enqueueScheduledRun(projectId: string, organizationId: string, agentId: string): Promise<string | null> {
  const sb = svc();
  const { data: run, error } = await sb
    .from('agent_runs')
    .insert({ project_id: projectId, agent_id: agentId, trigger_method: 'schedule', status: 'queued' })
    .select('id')
    .single();
  if (error || !run) return null;
  await inngest.send({ name: 'agent/run.requested', data: { runId: run.id, agentId, projectId } });
  if (isMeteredKind(agentId)) await recordUsage({ orgId: organizationId, projectId, agentRunId: run.id, kind: agentId });
  return run.id;
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

// Weekly re-measure (Mondays 02:00 UTC) — fresh scorecard + trend + competitor
// patrol for projects opted into weekly reporting. This is the "周报" data pull.
export const scheduledWeekly = inngest.createFunction(
  { id: 'scheduled-weekly', name: 'Weekly GEO re-measure', triggers: [{ cron: '0 2 * * 1' }] },
  async ({ step }) => {
    if (!schedulingEnabled()) return { skipped: 'SCHEDULED_SCANS_ENABLED!=1' };
    const projects = await step.run('list-weekly', () => listScheduledProjects(['weekly']));
    let enqueued = 0;
    for (const p of projects) {
      const id = await step.run(`monitor-${p.id}`, () => enqueueScheduledRun(p.id, p.organization_id, 'monitor'));
      if (id) enqueued++;
    }
    return { cadence: 'weekly', projects: projects.length, enqueued };
  },
);

// Monthly (1st, 03:00 UTC) — re-measure for monthly-cadence projects, then a
// report for every scheduled project. Covers M4 competitor patrol + M5 monthly
// maintenance report. Report synthesizes the latest scorecard.
export const scheduledMonthly = inngest.createFunction(
  { id: 'scheduled-monthly', name: 'Monthly GEO report & patrol', triggers: [{ cron: '0 3 1 * *' }] },
  async ({ step }) => {
    if (!schedulingEnabled()) return { skipped: 'SCHEDULED_SCANS_ENABLED!=1' };
    const monthly = await step.run('list-monthly', () => listScheduledProjects(['monthly']));
    for (const p of monthly) {
      await step.run(`monitor-${p.id}`, () => enqueueScheduledRun(p.id, p.organization_id, 'monitor'));
    }
    const all = await step.run('list-all', () => listScheduledProjects(['weekly', 'monthly']));
    let reports = 0;
    for (const p of all) {
      const id = await step.run(`report-${p.id}`, () => enqueueScheduledRun(p.id, p.organization_id, 'report'));
      if (id) reports++;
    }
    return { cadence: 'monthly', monitored: monthly.length, reports };
  },
);

export const functions = [runAgent, scheduledWeekly, scheduledMonthly];
