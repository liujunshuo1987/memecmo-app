// GET /api/connector/v1/events/deliverables[?type=a,b&limit=] — newest deliverables across the organization,
// with the client's edits applied (polling trigger feed; publish-ready text).
import { connectorAuth, runRest, optionsResponse } from '@/lib/connector/rest';
import { serviceClient } from '@/lib/commerce';
import { recentDeliverables } from '@/lib/connector/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const a = await connectorAuth(req);
  if ('response' in a) return a.response;
  const q = new URL(req.url).searchParams;
  const types = (q.get('type') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const limit = Math.max(1, Math.min(Number(q.get('limit') || 25), 50));
  return runRest(a.principal, 'events_deliverables', null, async () => ({ source: 'MemeCMO', deliverables: await recentDeliverables(serviceClient(), a.principal.orgId, { types, limit }) }));
}
export const OPTIONS = optionsResponse;
