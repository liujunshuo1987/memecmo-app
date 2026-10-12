import { connectorAuth, runRest, optionsResponse } from '@/lib/connector/rest';
import { serviceClient } from '@/lib/commerce';
import { envelope, latestScorecard, resolveProject } from '@/lib/connector/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { project: string } }) {
  const a = await connectorAuth(req);
  if ('response' in a) return a.response;
  const sb = serviceClient();
  const hit = await resolveProject(sb, a.principal.orgId, params.project);
  if (!hit) return runRest(a.principal, 'get_gaps', null, async () => { throw new Error(`Project "${params.project}" is not in this organization.`); });
  const limit = Math.max(1, Math.min(Number(new URL(req.url).searchParams.get('limit') || 50), 200));
  return runRest(a.principal, 'get_gaps', hit.project.id, async () => {
    const sc = await latestScorecard(sb, hit.project.id);
    const gaps = sc?.gaps ?? [];
    return envelope(hit.org, hit.project, { scanned_at: sc?.scannedAt ?? null, total: gaps.length, gaps: gaps.slice(0, limit) });
  });
}
export const OPTIONS = optionsResponse;
