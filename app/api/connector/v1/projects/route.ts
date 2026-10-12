// GET /api/connector/v1/projects — projects this credential can see.
import { connectorAuth, runRest, optionsResponse } from '@/lib/connector/rest';
import { serviceClient } from '@/lib/commerce';
import { envelope, listProjects, workspaceUrl } from '@/lib/connector/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const a = await connectorAuth(req);
  if ('response' in a) return a.response;
  const { principal } = a;
  return runRest(principal, 'list_projects', null, async () => {
    const { projects } = await listProjects(serviceClient(), principal.orgId);
    return envelope({ id: principal.orgId, slug: principal.orgSlug, name: principal.orgName }, null, {
      projects: projects.map((p) => ({ id: p.id, slug: p.slug, brand: p.brand_name, market: p.target_country, language: p.target_language, industry: p.industry, organization: p.org.name, status: p.status, latest_scan: p.latestScan, workspace_url: workspaceUrl(p.org.slug, p.slug) })),
    });
  });
}
export const OPTIONS = optionsResponse;
