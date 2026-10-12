// GET /api/connector/v1/projects/{project}/deliverables[?type=content_draft]
import { connectorAuth, runRest, optionsResponse } from '@/lib/connector/rest';
import { serviceClient } from '@/lib/commerce';
import { DELIVERABLE_TYPES, envelope, getDeliverable, listDeliverables, resolveProject, type DeliverableType } from '@/lib/connector/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { project: string } }) {
  const a = await connectorAuth(req);
  if ('response' in a) return a.response;
  const sb = serviceClient();
  const hit = await resolveProject(sb, a.principal.orgId, params.project);
  if (!hit) return runRest(a.principal, 'get_deliverables', null, async () => { throw new Error(`Project "${params.project}" is not in this organization.`); });
  const type = new URL(req.url).searchParams.get('type');
  return runRest(a.principal, 'get_deliverables', hit.project.id, async () => {
    if (!type) return envelope(hit.org, hit.project, { deliverables: await listDeliverables(sb, hit.project.id) });
    if (!(DELIVERABLE_TYPES as readonly string[]).includes(type)) throw new Error(`type must be one of ${DELIVERABLE_TYPES.join(', ')}`);
    const d = await getDeliverable(sb, hit.project.id, type as DeliverableType);
    return envelope(hit.org, hit.project, d ? { deliverable: d } : { deliverable: null, note: `No ${type} has been generated for this project yet.` });
  });
}
export const OPTIONS = optionsResponse;
