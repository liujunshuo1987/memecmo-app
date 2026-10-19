// GET /api/connector/v1/map[?id=&depth=&world=&type=] — the business map (public view), same as the
// MCP tool get_map and as the keyless /api/map; here it is logged against the caller's key.
import { connectorAuth, runRest, optionsResponse } from '@/lib/connector/rest';
import { queryMap } from '@/lib/map/query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const a = await connectorAuth(req);
  if ('response' in a) return a.response;
  const p = new URL(req.url).searchParams;
  return runRest(a.principal, 'get_map', null, async () => {
    const out = queryMap({ id: p.get('id') || undefined, depth: p.get('depth') ? Number(p.get('depth')) : undefined, world: p.get('world') || undefined, type: p.get('type') || undefined });
    if ('error' in out) throw new Error(String(out.error));
    return out;
  });
}
export const OPTIONS = optionsResponse;
