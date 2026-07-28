// Competitor-set & prompt-set editing (Javvo entity-resolution spec: "先让人
// 能修错" — manual correction is the floor, not a nice-to-have).
//
//   GET  ?projectId=   → { competitorSet, promptEdits, promptLibrary }
//   POST { projectId, competitorGroups?, promptEdits? }
//        competitorGroups: [{ canonical, aliases[], relationship }]
//        promptEdits:      { excluded: string[], added: string[] }
//
// Edits live on projects.metadata — the Discovery asset and scan history are
// never mutated. Admin-gated (org / parent / root), same policy as billing.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAdminOrg } from '@/lib/org-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RELATIONSHIPS = new Set(['competitor', 'partner', 'directory', 'self']);

async function authorize(projectId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const svc = serviceClient();
  const { data: project } = await svc
    .from('projects')
    .select('id, metadata, organizations!inner(id, parent_org_id)')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  const org: any = project.organizations;
  if (!(await canAdminOrg(supabase, user.id, { id: org.id, parent_org_id: org.parent_org_id }))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { svc, project };
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const auth = await authorize(projectId);
  if ('error' in auth) return auth.error;
  const meta: any = auth.project.metadata || {};

  // Latest Discovery library so the UI can offer per-prompt exclusion.
  const { data: psAsset } = await auth.svc
    .from('assets')
    .select('content')
    .eq('project_id', projectId)
    .eq('type', 'prompt_set')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let promptLibrary: { category: string; label: string; prompts: string[] }[] = [];
  let keyPrompts: string[] = [];
  if (psAsset?.content) {
    try {
      const ps = JSON.parse(psAsset.content);
      promptLibrary = ps?.promptSet ?? [];
      keyPrompts = Array.isArray(ps?.keyPrompts) ? ps.keyPrompts : [];
    } catch { /* corrupted asset → empty library; editor still works for competitors */ }
  }

  return NextResponse.json({
    competitorSet: meta.competitorSet ?? null,
    promptEdits: meta.promptEdits ?? { excluded: [], added: [] },
    promptLibrary,
    keyPrompts,
  });
}

export async function POST(req: NextRequest) {
  let body: { projectId?: string; competitorGroups?: any[]; promptEdits?: { excluded?: string[]; added?: string[] } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (!body.projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const auth = await authorize(body.projectId);
  if ('error' in auth) return auth.error;
  const meta: any = { ...(auth.project.metadata || {}) };

  if (Array.isArray(body.competitorGroups)) {
    const groups = body.competitorGroups
      .slice(0, 40)
      .map((g: any) => ({
        canonical: String(g?.canonical ?? '').trim().slice(0, 120),
        aliases: Array.isArray(g?.aliases) ? g.aliases.map((a: any) => String(a).trim().slice(0, 120)).filter(Boolean).slice(0, 12) : [],
        relationship: RELATIONSHIPS.has(g?.relationship) ? g.relationship : 'competitor',
      }))
      .filter((g: any) => g.canonical);
    // Keep the original freeze date — editing the set must not reset the TTL
    // or it would silently re-identify next scan.
    meta.competitorSet = {
      groups,
      refreshedAt: meta.competitorSet?.refreshedAt ?? new Date().toISOString(),
      editedAt: new Date().toISOString(),
    };
  }

  if (body.promptEdits) {
    const clean = (xs: any) => (Array.isArray(xs) ? xs.map((s: any) => String(s).trim().slice(0, 300)).filter(Boolean).slice(0, 300) : []);
    meta.promptEdits = { excluded: clean(body.promptEdits.excluded), added: clean(body.promptEdits.added) };
  }

  const { error } = await auth.svc.from('projects').update({ metadata: meta }).eq('id', auth.project.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, competitorSet: meta.competitorSet ?? null, promptEdits: meta.promptEdits ?? null });
}
