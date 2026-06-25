// GET /api/workspace/agent-runs/[id]/stream — Server-Sent Events stream.
//
// This endpoint does double duty:
//   1. If the run is still 'queued', it atomically claims it and RUNS the
//      agent inline — the streaming response keeps the serverless function
//      alive for the agent's full duration (the reliable way to do
//      background work on Vercel without a separate queue).
//   2. Streams every agent event to the client as it happens, plus run
//      status snapshots, and closes when the run reaches a terminal state.
//
// If the run was already claimed by another connection (or already finished),
// this falls back to replaying persisted events via polling.

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { claimRun, executeAgentRun, type AgentEvent } from '@/lib/agents/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const POLL_INTERVAL_MS = 600;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const runId = params.id;

  // Fetch run + its project (RLS-gated)
  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .select('id, status, agent_id, project_id')
    .eq('id', runId)
    .maybeSingle();
  if (runError || !run) {
    return new Response('Run not found or no access', { status: 404 });
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, brand_name, brand_url, target_country, target_language, industry')
    .eq('id', run.project_id)
    .maybeSingle();
  if (!project) {
    return new Response('Project not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const push = (data: unknown, event?: string) => {
        if (closed) return;
        const payload = JSON.stringify(data);
        const frame = event
          ? `event: ${event}\ndata: ${payload}\n\n`
          : `data: ${payload}\n\n`;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          closed = true;
        }
      };

      push({ runId, status: run.status }, 'hello');

      // Try to claim the run. If we win, execute the agent inline, pushing
      // each event straight to the stream (real-time, no polling lag).
      const won = run.status === 'queued' ? await claimRun(runId) : false;

      if (won) {
        push({ status: 'running', progress_pct: 0, summary: null }, 'run');

        const emit = async (ev: AgentEvent) => {
          push(ev, 'event');
          // Surface progress as a run snapshot too, so the bar moves
          if (ev.event_type === 'progress' && typeof ev.payload.pct === 'number') {
            push({ status: 'running', progress_pct: ev.payload.pct, summary: null }, 'run');
          }
        };

        await executeAgentRun(runId, run.agent_id, project, emit);

        // Final snapshot
        const { data: finalRun } = await supabase
          .from('agent_runs')
          .select('status, progress_pct, summary, output')
          .eq('id', runId)
          .single();
        if (finalRun) {
          push(finalRun, 'run');
          push({ status: finalRun.status }, 'done');
        }
        closed = true;
        controller.close();
        return;
      }

      // Otherwise: replay/poll mode (run already claimed or terminal)
      let lastTs = '1970-01-01T00:00:00Z';
      const poll = async () => {
        if (closed) return;

        const { data: events } = await supabase
          .from('agent_run_events')
          .select('*')
          .eq('agent_run_id', runId)
          .gt('ts', lastTs)
          .order('ts', { ascending: true });
        if (events && events.length) {
          for (const ev of events) {
            push(ev, 'event');
            lastTs = ev.ts;
          }
        }

        const { data: snap } = await supabase
          .from('agent_runs')
          .select('status, progress_pct, summary, output')
          .eq('id', runId)
          .single();
        if (snap) {
          push(snap, 'run');
          if (['completed', 'failed', 'canceled'].includes(snap.status)) {
            push({ status: snap.status }, 'done');
            closed = true;
            controller.close();
            return;
          }
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      };
      void poll();
    },
    cancel() {
      // client disconnected
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
