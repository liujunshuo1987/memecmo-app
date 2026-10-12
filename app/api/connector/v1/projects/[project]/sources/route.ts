import { connectorAuth, runRest, optionsResponse } from '@/lib/connector/rest';
import { serviceClient } from '@/lib/commerce';
import { envelope, resolveProject, sourcesRanking } from '@/lib/connector/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { project: string } }) {
  const a = await connectorAuth(req);
  if ('response' in a) return a.response;
  const sb = serviceClient();
  const hit = await resolveProject(sb, a.principal.orgId, params.project);
  if (!hit) return runRest(a.principal, 'get_sources', null, async () => { throw new Error(`Project "${params.project}" is not in this organization.`); });
  const limit = Math.max(1, Math.min(Number(new URL(req.url).searchParams.get('limit') || 25), 100));
  return runRest(a.principal, 'get_sources', hit.project.id, async () => envelope(hit.org, hit.project, await sourcesRanking(sb, hit.project.id, limit)));
}
export const OPTIONS = optionsResponse;
