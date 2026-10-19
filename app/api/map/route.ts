// JSON of the public business map for anyone's tools (the open-platform face without a key).
// Same view as /map and as the connector's get_map: public objects only. Query: ?id=&depth=&world=&type=

import { NextResponse } from 'next/server';
import { queryMap } from '@/lib/map/query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const data = queryMap({ id: p.get('id') || undefined, depth: p.get('depth') ? Number(p.get('depth')) : undefined, world: p.get('world') || undefined, type: p.get('type') || undefined });
  return NextResponse.json(data, { status: 'error' in data ? 404 : 200, headers: { 'cache-control': 'public, max-age=300, s-maxage=3600', 'access-control-allow-origin': '*' } });
}
