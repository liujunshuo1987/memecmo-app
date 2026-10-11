// Suggested actions — pages the platform found on the client's own site that
// nobody has logged yet. lib/suggestions.ts, table intervention_suggestions.
//
// GET   ?projectId=          pending suggestions + what the caller may do with them
// POST  { projectId, id, action: 'confirm', publishedAt?, targetPrompts?: string[] }
//       { projectId, id, action: 'dismiss' }
//
// Authorisation: any member of the project's org may read. Confirming creates an
// intervention signed by the caller, so it needs an account that may sign for
// the client (canSignForOrg — MemeCMO operators cannot confirm on a client's
// behalf). Dismissing ("not ours") needs admin or editor (canEditOrg).
// Service client after that check.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAccessOrg, canEditOrg, canSignForOrg } from '@/lib/org-auth';
import { confirmSuggestion, dismissSuggestion, loadPendingSuggestions } from '@/lib/suggestions';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authorize(projectId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const svc = serviceClient();
  const { data: project } = await svc.from('projects').select('id, organizations(id, parent_org_id)').eq('id', projectId).maybeSingle();
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  const org: any = (project as any).organizations;
  const scope = { id: org.id, parent_org_id: org.parent_org_id };
  if (!(await canAccessOrg(supabase, user.id, scope))) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const [canConfirm, canDismiss] = await Promise.all([canSignForOrg(supabase, user.id, scope), canEditOrg(supabase, user.id, scope)]);
  return { svc, user, canConfirm, canDismiss };
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const a = await authorize(projectId);
  if ('error' in a) return a.error;
  try {
    const suggestions = await loadPendingSuggestions(a.svc, projectId);
    return NextResponse.json({ suggestions, canConfirm: a.canConfirm, canDismiss: a.canDismiss });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const { projectId, id, action, publishedAt } = body ?? {};
  if (!projectId || !id || (action !== 'confirm' && action !== 'dismiss')) return NextResponse.json({ error: 'Missing projectId, id or action' }, { status: 400 });
  const a = await authorize(projectId);
  if ('error' in a) return a.error;

  if (action === 'dismiss') {
    if (!a.canDismiss) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const r = await dismissSuggestion(a.svc, { projectId, id, userId: a.user.id });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 409 });
  }

  if (!a.canConfirm) return NextResponse.json({ error: 'Only the client team can confirm a suggested action' }, { status: 403 });
  const r = await confirmSuggestion(a.svc, {
    projectId, id, userId: a.user.id, channel: 'web',
    publishedAt: typeof publishedAt === 'string' && publishedAt ? publishedAt : undefined,
    targetPrompts: Array.isArray(body.targetPrompts) ? body.targetPrompts.filter((p: unknown) => typeof p === 'string') : undefined,
  });
  if ('error' in r) {
    const status = r.error === 'not-found' ? 404 : r.error.startsWith('already') ? 409 : r.error.endsWith('-date') ? 400 : 500;
    return NextResponse.json({ error: r.error }, { status });
  }
  // Same as a hand-logged action: verify the page right away — best effort.
  try { await inngest.send({ name: 'geo/intervention.verify', data: { interventionId: r.intervention.id } }); } catch (e) { console.warn('[verify] enqueue failed:', e instanceof Error ? e.message : String(e)); }
  return NextResponse.json({ ok: true, intervention: r.intervention });
}
