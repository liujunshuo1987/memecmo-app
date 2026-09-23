// Operator-only: run the engine liveness patrol on demand and return the
// result. The same code the 01:30 UTC cron runs (lib/engines/health.ts), so a
// "did the patrol catch it?" question can be answered without waiting a day.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { isOperator } from '@/lib/org-auth';
import { runEnginePatrol } from '@/lib/engines/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isOperator(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const out = await runEnginePatrol(serviceClient());
  return NextResponse.json(out);
}
