// GET /api/workspace/agent-runs/[id]?since=<iso-ts>
//
// Read-only run observer. Returns the run's current status snapshot plus any
// events newer than `since`. The workspace UI polls this while a run is
// active. Execution happens entirely in Inngest — this endpoint never runs
// the agent, so it's safe, cheap, and decoupled.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = params.id;
  const since = req.nextUrl.searchParams.get('since') || '1970-01-01T00:00:00Z';

  // RLS gates visibility to runs in projects the user can see
  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .select('id, agent_id, status, progress_pct, summary, output, error_message, created_at, completed_at')
    .eq('id', runId)
    .maybeSingle();
  if (runError || !run) {
    return NextResponse.json({ error: 'Run not found or no access' }, { status: 404 });
  }

  const { data: events } = await supabase
    .from('agent_run_events')
    .select('id, ts, event_type, payload')
    .eq('agent_run_id', runId)
    .gt('ts', since)
    .order('ts', { ascending: true });

  return NextResponse.json({
    run,
    events: events ?? [],
    // Convenience: latest event ts so the client can pass it back as `since`
    cursor: events && events.length ? events[events.length - 1].ts : since,
    terminal: ['completed', 'failed', 'canceled'].includes(run.status),
  });
}
