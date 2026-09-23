// Golden-set labelling API (operator-only).
//   GET  ?language=vi   → { item (blind: no machine labels), progress }
//   POST { poolId, brandMentioned, prominence, sentiment, competitors, notes?, seconds? } → upsert this user's label
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { isOperator } from '@/lib/org-auth';
import { nextItemFor, progress, GOLDEN_LANGUAGES } from '@/lib/golden';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await isOperator(supabase, user.id))) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { svc: serviceClient(), user };
}

export async function GET(req: NextRequest) {
  const g = await gate(); if ('error' in g) return g.error;
  const language = req.nextUrl.searchParams.get('language') ?? 'vi';
  if (!(GOLDEN_LANGUAGES as readonly string[]).includes(language)) return NextResponse.json({ error: 'language must be vi|zh|en' }, { status: 400 });
  const [item, prog] = await Promise.all([nextItemFor(g.svc, language, g.user.email ?? g.user.id), progress(g.svc)]);
  return NextResponse.json({ item, progress: prog, labeler: g.user.email ?? g.user.id });
}

export async function POST(req: NextRequest) {
  const g = await gate(); if ('error' in g) return g.error;
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const prominence = Number(b.prominence);
  if (!b.poolId || typeof b.brandMentioned !== 'boolean' || !Number.isInteger(prominence) || prominence < 0 || prominence > 3
    || !['positive', 'neutral', 'negative', 'none'].includes(b.sentiment)) {
    return NextResponse.json({ error: 'Invalid label' }, { status: 400 });
  }
  const competitors = Array.isArray(b.competitors) ? b.competitors.filter((x: unknown) => typeof x === 'string').slice(0, 30) : [];
  const { error } = await g.svc.from('golden_labels').upsert(
    { pool_id: b.poolId, labeler: g.user.email ?? g.user.id, brand_mentioned: b.brandMentioned, prominence, sentiment: b.sentiment, competitors, notes: b.notes || null, seconds: Number.isFinite(Number(b.seconds)) ? Math.round(Number(b.seconds)) : null, labeled_at: new Date().toISOString() },
    { onConflict: 'pool_id,labeler' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
