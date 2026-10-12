// GET /api/connector/v1/me — who this credential is (Zapier's connection test + label).
import { connectorAuth, runRest, optionsResponse } from '@/lib/connector/rest';
import { serviceClient } from '@/lib/commerce';
import { listProjects } from '@/lib/connector/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const a = await connectorAuth(req);
  if ('response' in a) return a.response;
  const { principal } = a;
  return runRest(principal, 'me', null, async () => {
    const { projects } = await listProjects(serviceClient(), principal.orgId);
    return { source: 'MemeCMO', organization: principal.orgName, organization_slug: principal.orgSlug, credential: principal.kind, scopes: principal.scopes, projects: projects.length };
  });
}
export const OPTIONS = optionsResponse;
