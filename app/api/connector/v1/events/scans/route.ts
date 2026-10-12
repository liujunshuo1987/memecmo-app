// GET /api/connector/v1/events/scans — newest comparable scans across the organization (polling trigger feed).
import { connectorAuth, runRest, optionsResponse } from '@/lib/connector/rest';
import { serviceClient } from '@/lib/commerce';
import { recentScans } from '@/lib/connector/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const a = await connectorAuth(req);
  if ('response' in a) return a.response;
  const limit = Math.max(1, Math.min(Number(new URL(req.url).searchParams.get('limit') || 25), 50));
  return runRest(a.principal, 'events_scans', null, async () => ({ source: 'MemeCMO', scans: await recentScans(serviceClient(), a.principal.orgId, limit) }));
}
export const OPTIONS = optionsResponse;
