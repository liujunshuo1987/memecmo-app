// POST /api/workspace/agent-runs — spawn an agent run on a project
//
// The HTTP request returns the run row immediately. The actual agent work
// runs in the background and emits events to public.agent_run_events.
// Clients subscribe to /api/workspace/agent-runs/[id]/stream for SSE updates.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { AGENTS, V05_AGENT_IDS } from '@/lib/agents/registry';
import { runDiscoveryAgent, makeEventPersister } from '@/lib/agents/discovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CreateRunBody {
  projectId: string;
  agentId: string;        // 'discovery' | 'monitor' | 'report'
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

  // Fetch project (RLS: user must be allowed to see it)
  const { data: project, error: projError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', body.projectId)
    .maybeSingle();
  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found or no access' }, { status: 404 });
  }

  // Create the run (queued)
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

  // Kick off the agent in the background. We deliberately don't await this —
  // the HTTP response returns immediately so the UI can subscribe to SSE.
  // For v0.5 we rely on the request lifecycle to keep the Lambda warm long
  // enough; for long-running monitor runs we'll move to Inngest in v0.6.
  void runAgentInBackground(run.id, body.agentId, project);

  return NextResponse.json({ ok: true, run });
}

async function runAgentInBackground(
  runId: string,
  agentId: string,
  project: {
    id: string;
    brand_name: string;
    brand_url: string | null;
    target_country: string;
    target_language: string | null;
    industry: string | null;
  },
) {
  // Use service role so we can update agent_runs and insert events
  // without being constrained by the original user's RLS.
  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const emit = makeEventPersister(runId);

  await svc
    .from('agent_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', runId);

  try {
    let result: { summary: string; output: Record<string, unknown> };
    if (agentId === 'discovery') {
      result = await runDiscoveryAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          industry: project.industry,
        },
        emit,
      );
    } else {
      // Other agents stubbed for v0.5
      const def = AGENTS[agentId];
      await emit({
        event_type: 'log',
        payload: { text: `${def?.displayName ?? agentId} — not yet implemented in v0.5. Stub run.` },
      });
      await new Promise((r) => setTimeout(r, 800));
      result = {
        summary: `${def?.displayName ?? agentId} stub run completed (v0.5 placeholder).`,
        output: { stub: true, agent: agentId },
      };
    }

    await svc
      .from('agent_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_pct: 100,
        summary: result.summary,
        output: result.output,
      })
      .eq('id', runId);

    // Persist a top-level "prompt_set" asset for discovery runs
    if (agentId === 'discovery') {
      await svc.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'prompt_set',
        title: `${project.brand_name} — Discovery prompt set`,
        format: 'json',
        content: JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await emit({ event_type: 'error', payload: { message: msg } });
    await svc
      .from('agent_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: msg,
      })
      .eq('id', runId);
  }
}
