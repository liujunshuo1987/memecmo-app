// GET  /api/connector/v1/projects/{project}/actions          — the action ledger with verification + outcomes
// POST /api/connector/v1/projects/{project}/actions          — log a published action (write scope)
//   { kind, url?, published_at, title?, note?, target_prompts?: string[], source_run_id? }
import { connectorAuth, runRest, optionsResponse } from '@/lib/connector/rest';
import { serviceClient } from '@/lib/commerce';
import { envelope, listActions, logAction, resolveProject } from '@/lib/connector/data';
import { INTERVENTION_KINDS } from '@/lib/interventions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { project: string } }) {
  const a = await connectorAuth(req);
  if ('response' in a) return a.response;
  const sb = serviceClient();
  const hit = await resolveProject(sb, a.principal.orgId, params.project);
  if (!hit) return runRest(a.principal, 'get_actions', null, async () => { throw new Error(`Project "${params.project}" is not in this organization.`); });
  return runRest(a.principal, 'get_actions', hit.project.id, async () => envelope(hit.org, hit.project, { actions: await listActions(sb, hit.project.id) }));
}

export async function POST(req: Request, { params }: { params: { project: string } }) {
  const a = await connectorAuth(req, { write: true });
  if ('response' in a) return a.response;
  const sb = serviceClient();
  const hit = await resolveProject(sb, a.principal.orgId, params.project);
  if (!hit) return runRest(a.principal, 'log_action', null, async () => { throw new Error(`Project "${params.project}" is not in this organization.`); });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  return runRest(a.principal, 'log_action', hit.project.id, async () => {
    const kind = String(body.kind ?? '');
    if (!(INTERVENTION_KINDS as readonly string[]).includes(kind)) throw new Error(`kind must be one of ${INTERVENTION_KINDS.join(', ')}`);
    const targets = Array.isArray(body.target_prompts) ? body.target_prompts.filter((p): p is string => typeof p === 'string')
      : typeof body.target_prompts === 'string' ? body.target_prompts.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
    const r = await logAction(sb, hit.project, {
      kind, url: typeof body.url === 'string' ? body.url : null, publishedAt: String(body.published_at ?? '').slice(0, 10),
      title: typeof body.title === 'string' ? body.title : null, note: typeof body.note === 'string' ? body.note : null,
      targetPrompts: targets, sourceRunId: typeof body.source_run_id === 'string' ? body.source_run_id : null,
    }, { loggedBy: a.principal.createdBy, keyId: a.principal.keyId, tokenId: a.principal.tokenId });
    return envelope(hit.org, hit.project, {
      id: r.intervention.id, logged: !r.duplicate, duplicate: r.duplicate, verification_queued: r.verificationQueued,
      kind: r.intervention.kind, url: r.intervention.url, published_at: r.intervention.published_at,
      target_prompts: r.intervention.target_prompts.map((t) => t.prompt),
    });
  });
}
export const OPTIONS = optionsResponse;
