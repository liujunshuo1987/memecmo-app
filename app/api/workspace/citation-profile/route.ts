// What the engines cite in this project — page features by engine and by
// citation intensity (lib/pages/profile, SQL-aggregated). RLS via the
// user's session client (geo_citations project-visible; geo_pages public web).
//
// GET ?projectId= → { rows: ProfileRow[] }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadCitationProfile } from '@/lib/pages/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ rows: await loadCitationProfile(supabase as any, projectId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
