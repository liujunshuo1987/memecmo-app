// JSON of the public business map for members' own tools (the open-platform seed).
// Same view as /map: public objects only, nodes + typed links + the type and link vocabularies.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MAP_VIEW } from '@/lib/map/public-view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(
    { source: 'MemeCMO business ontology map (public view)', version: MAP_VIEW.version, as_of: MAP_VIEW.as_of, page: 'https://app.memecmo.ai/map', ...MAP_VIEW.graph },
    { headers: { 'cache-control': 'private, max-age=300' } },
  );
}
