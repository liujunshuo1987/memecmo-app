// Agent dispatcher — runs an agent for a given run row, emitting events
// through whatever emitter is supplied, and finalizes the run + assets.
//
// Designed to be invoked from the SSE stream endpoint: that endpoint is a
// long-lived streaming response, so the serverless function stays alive for
// the agent's full duration (unlike a fire-and-forget after an HTTP return,
// which Vercel freezes immediately).

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { AGENTS } from './registry';
import { runDiscoveryAgent } from './discovery';
import { runMonitorAgent } from './monitor';

export type AgentEvent = {
  event_type:
    | 'log'
    | 'tool_call'
    | 'tool_result'
    | 'progress'
    | 'output_chunk'
    | 'error'
    | 'milestone';
  payload: Record<string, unknown>;
};

export type Emitter = (event: AgentEvent) => Promise<void>;

interface ProjectLite {
  id: string;
  brand_name: string;
  brand_url: string | null;
  target_country: string;
  target_language: string | null;
  industry: string | null;
}

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Atomically claim a queued run (queued → running). Returns true if we won
// the claim (and should run the agent), false if someone else already did.
export async function claimRun(runId: string): Promise<boolean> {
  const sb = svc();
  const { data } = await sb
    .from('agent_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'queued')
    .select('id');
  return !!data && data.length > 0;
}

// Run the agent end-to-end: emit events, finalize status, persist assets.
export async function executeAgentRun(
  runId: string,
  agentId: string,
  project: ProjectLite,
  emit: Emitter,
): Promise<void> {
  const sb = svc();

  // Combined emitter: persist to DB (for history/replay) + caller's emitter.
  const persistAndEmit: Emitter = async (event) => {
    await sb.from('agent_run_events').insert({
      agent_run_id: runId,
      event_type: event.event_type,
      payload: event.payload,
    });
    // Mirror progress events onto the run row so the UI progress bar moves
    // smoothly instead of jumping 0 → 100 at completion.
    if (event.event_type === 'progress' && typeof event.payload?.pct === 'number') {
      await sb.from('agent_runs').update({ progress_pct: event.payload.pct }).eq('id', runId);
    }
    await emit(event);
  };

  try {
    let result: { summary: string; output: Record<string, unknown> };

    if (agentId === 'discovery') {
      result = await runDiscoveryAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
        },
        persistAndEmit,
      );
    } else if (agentId === 'monitor') {
      // Monitor measures the latest Discovery prompt set against AI engines.
      const { data: psAsset } = await sb
        .from('assets')
        .select('content')
        .eq('project_id', project.id)
        .eq('type', 'prompt_set')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!psAsset?.content) {
        throw new Error('No Discovery prompt set found for this project. Run Discovery first.');
      }
      let promptSet: { category: string; label: string; prompts: string[] }[] = [];
      try {
        promptSet = JSON.parse(psAsset.content)?.promptSet ?? [];
      } catch {
        throw new Error('Discovery prompt set asset is corrupted — re-run Discovery.');
      }
      if (!promptSet.length) {
        throw new Error('Discovery prompt set is empty — re-run Discovery.');
      }
      result = await runMonitorAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          promptSet,
        },
        persistAndEmit,
      );
    } else {
      const def = AGENTS[agentId];
      await persistAndEmit({
        event_type: 'log',
        payload: { text: `${def?.displayName ?? agentId} — not yet implemented in v0.5. Stub run.` },
      });
      await persistAndEmit({ event_type: 'progress', payload: { pct: 100 } });
      result = {
        summary: `${def?.displayName ?? agentId} stub run completed (v0.5 placeholder).`,
        output: { stub: true, agent: agentId },
      };
    }

    await sb
      .from('agent_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_pct: 100,
        summary: result.summary,
        output: result.output,
      })
      .eq('id', runId);

    if (agentId === 'discovery') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'prompt_set',
        title: `${project.brand_name} — Discovery prompt set`,
        format: 'json',
        content: JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'monitor') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'geo_scorecard',
        title: `${project.brand_name} — GEO visibility scorecard`,
        format: 'json',
        content: JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await persistAndEmit({ event_type: 'error', payload: { message: msg } });
    await sb
      .from('agent_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: msg,
      })
      .eq('id', runId);
  }
}
