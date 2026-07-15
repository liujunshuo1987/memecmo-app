// POST /api/workspace/agent-runs — create a queued agent run on a project.
//
// This endpoint does NOT run the agent. It inserts a queued run row and emits
// an `agent/run.requested` event to Inngest, which invokes /api/inngest
// server-to-server to do the durable background work. The UI then observes
// progress by polling GET /api/workspace/agent-runs/[id]. This avoids the
// serverless fire-and-forget trap where work scheduled after an HTTP return
// is frozen by the platform.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { V05_AGENT_IDS } from '@/lib/agents/registry';
import { inngest } from '@/lib/inngest/client';
import { getQuotaStatusForProject, isMeteredKind, recordUsage, orgIdForProject } from '@/lib/commerce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CreateRunBody {
  projectId: string;
  agentId: string;
  inputPrompt?: string;
  triggerMethod?: 'chat' | 'schedule' | 'api' | 'cascade';
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CreateRunBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  if (!body.projectId || !body.agentId) {
    return NextResponse.json({ error: 'Missing projectId or agentId' }, { status: 400 });
  }
  if (!V05_AGENT_IDS.includes(body.agentId)) {
    return NextResponse.json(
      { error: `Unknown agent. v0.5 supports: ${V05_AGENT_IDS.join(', ')}` },
      { status: 400 },
    );
  }

  // RLS: user must be allowed to see this project
  const { data: project, error: projError } = await supabase
    .from('projects')
    .select('id')
    .eq('id', body.projectId)
    .maybeSingle();
  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found or no access' }, { status: 404 });
  }

  // ③ Commercial: enforce monthly scan quota for metered (end_client) orgs.
  // Operator + channel-partner orgs are never metered (see lib/commerce.ts).
  const metered = isMeteredKind(body.agentId);
  const quota = metered ? await getQuotaStatusForProject(body.projectId) : null;
  if (quota?.metered && quota.overQuota) {
    const message = quota.subscriptionBlocked
      ? `Subscription is ${quota.status} — renew billing in the dashboard to continue scanning.`
      : `Monthly scan quota reached (${quota.used}/${quota.quota} on ${quota.planName}). Upgrade the plan or wait for the next billing period.`;
    return NextResponse.json({ error: 'quota_exceeded', message, quota }, { status: 402 });
  }

  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .insert({
      project_id: body.projectId,
      agent_id: body.agentId,
      triggered_by: user.id,
      trigger_method: body.triggerMethod ?? 'chat',
      input_prompt: body.inputPrompt ?? null,
      status: 'queued',
    })
    .select('*')
    .single();

  if (runError || !run) {
    return NextResponse.json(
      { error: runError?.message || 'Failed to create run' },
      { status: 500 },
    );
  }

  // Hand off to Inngest for durable background execution. This is fully
  // decoupled from this HTTP request — Inngest invokes /api/inngest
  // server-to-server, so the run completes regardless of whether the client
  // stays connected.
  try {
    await inngest.send({
      name: 'agent/run.requested',
      data: { runId: run.id, agentId: body.agentId, projectId: body.projectId },
    });
  } catch (err) {
    // If the event can't be enqueued, mark the run failed so it doesn't sit
    // in 'queued' forever.
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from('agent_runs')
      .update({ status: 'failed', error_message: `Enqueue failed: ${msg}` })
      .eq('id', run.id);
    return NextResponse.json(
      { error: `Failed to enqueue run: ${msg}` },
      { status: 502 },
    );
  }

  // ③ Commercial: meter the run after a successful enqueue.
  if (metered) {
    const orgId = await orgIdForProject(body.projectId);
    if (orgId) await recordUsage({ orgId, projectId: body.projectId, agentRunId: run.id, kind: body.agentId });
  }

  return NextResponse.json({ ok: true, run, quota });
}
