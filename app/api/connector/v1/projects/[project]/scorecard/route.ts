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
  if (!hit) return runRest(a.principal, 'get_scorecard', null, async () => { throw new Error(`Project "${params.project}" is not in this organization.`); });
  return runRest(a.principal, 'get_scorecard', hit.project.id, async () => {
    const sc = await latestScorecard(sb, hit.project.id);
    if (!sc) return envelope(hit.org, hit.project, { scorecard: null, note: 'No comparable scan yet for this project.' });
    const { gaps, ...rest } = sc;
    return envelope(hit.org, hit.project, { scorecard: rest, gap_count: gaps.length, gaps_preview: gaps.slice(0, 5) });
  });
}
export const OPTIONS = optionsResponse;
