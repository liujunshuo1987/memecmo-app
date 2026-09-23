// Source-authority ranking, aggregated in SQL at read time.
//
// GET ?projectId=   → { ranking: [{ domain, citations, answers, engines, isBrand }], totalCitations }
//
// Why this exists: scorecards stored before 2026-09-23 carry a ranking that was
// computed from a 1000-row prefix of the citation index (PostgREST reply cap),
// so their "all scans" numbers are wrong. The dashboard calls this when a
// stored ranking lacks the per-answer unit and shows the live aggregate
// instead. Authorisation is the table's own RLS: the user's session client
// invokes a SECURITY INVOKER function over geo_citations, so a project the
// caller cannot see simply returns no rows.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [rpc, total] = await Promise.all([
    supabase.rpc('geo_citation_ranking', { p_project_id: projectId, p_limit: 20 }),
    supabase.from('geo_citations').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ]);
  if (rpc.error) return NextResponse.json({ error: rpc.error.message }, { status: 500 });
  const ranking = ((rpc.data ?? []) as { domain: string; citations: number | string; answers: number | string; engines: number | string; is_brand: boolean }[])
    .map((r) => ({ domain: r.domain, citations: Number(r.citations), answers: Number(r.answers), engines: Number(r.engines), isBrand: !!r.is_brand }));
  return NextResponse.json({ ranking, totalCitations: total.count ?? 0 });
}
