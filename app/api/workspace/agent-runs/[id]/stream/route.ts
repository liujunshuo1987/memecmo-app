// GET /api/workspace/agent-runs/[id]/stream — Server-Sent Events stream
//
// Polls public.agent_run_events for new rows and pushes each as an SSE
// `data:` frame. Closes when the run reaches a terminal state.
//
// SSE is preferred over WebSockets here because:
//   - Vercel supports streaming responses natively;
//   - the client only needs server-→-client push;
//   - there's no extra Vercel build config required.

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Cap long-running monitor runs at 5 minutes per stream; client reconnects if needed.
export const maxDuration = 300;

const POLL_INTERVAL_MS = 700;

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

  // Check the user can see this run (RLS enforces it on the table; we also
  // do an explicit fetch to fail fast with 404 instead of an empty stream).
  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .select('id, status, project_id')
    .eq('id', runId)
    .maybeSingle();
  if (runError || !run) {
    return new Response('Run not found or no access', { status: 404 });
  }

  const encoder = new TextEncoder();
  let lastTs = '1970-01-01T00:00:00Z';
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const push = (data: unknown, event?: string) => {
        if (closed) return;
        const payload = JSON.stringify(data);
        const frame = event
          ? `event: ${event}\ndata: ${payload}\n\n`
          : `data: ${payload}\n\n`;
        controller.enqueue(encoder.encode(frame));
      };

      // Send a hello frame
      push({ runId, status: run.status }, 'hello');

      // Poll loop
      const poll = async () => {
        if (closed) return;

        const { data: events } = await supabase
          .from('agent_run_events')
          .select('*')
          .eq('agent_run_id', runId)
          .gt('ts', lastTs)
          .order('ts', { ascending: true });

        if (events && events.length > 0) {
          for (const ev of events) {
            push(ev, 'event');
            lastTs = ev.ts;
          }
        }

        // Also poll run status to know when to close
        const { data: snapshot } = await supabase
          .from('agent_runs')
          .select('status, progress_pct, summary, output')
          .eq('id', runId)
          .single();

        if (snapshot) {
          push(snapshot, 'run');
          if (
            snapshot.status === 'completed' ||
            snapshot.status === 'failed' ||
            snapshot.status === 'canceled'
          ) {
            push({ status: snapshot.status }, 'done');
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
      closed = true;
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
