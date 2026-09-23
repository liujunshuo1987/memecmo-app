// Competitor-set & prompt-set editing (Javvo entity-resolution spec: "先让人
// 能修错" — manual correction is the floor, not a nice-to-have).
//
//   GET  ?projectId=   → { competitorSet, promptEdits, promptLibrary, keyPrompts, corePrompts }
//   POST { projectId, competitorGroups?, promptEdits? }
//        competitorGroups: [{ canonical, aliases[], relationship }]
//        promptEdits:      { excluded: string[], added: string[],
//                            rewrites: [{ from, to, note? }] }
//
// Edits live on projects.metadata — the Discovery asset and scan history are
// never mutated. Admin-gated (org / parent / root), same policy as billing.
//
// Governance (FMVN Annex 2, MS-20260922): prompts in metadata.coreKeyPrompts
// are contractually frozen — the server drops any exclusion or rewrite that
// targets one and reports it in `blockedCore`, so the KPI panel can only be
// changed through the bilateral written sign-off path, never through the UI.
//
// Every accepted change is appended to metadata.promptEditLog {at, by, action,
// from?, to?, note?} — the localization know-how of the operator team is a
// labelled dataset (post-training asset), not just a settings diff.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAccessOrg } from '@/lib/org-auth';

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
  // Member-gated, not admin-gated: the channel partner's operating team does
  // the prompt localization itself (FMVN meeting 2026-09-23). Non-members of
  // the org / parent / root still get 403.
  if (!(await canAccessOrg(supabase, user.id, { id: org.id, parent_org_id: org.parent_org_id }))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { svc, project, user };
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
    promptEdits: meta.promptEdits ?? { excluded: [], added: [], rewrites: [] },
    promptLibrary,
    keyPrompts,
    corePrompts: Array.isArray(meta.coreKeyPrompts) ? meta.coreKeyPrompts : [],
  });
}

// Same normalization as applyCoreLock in lib/agents/run.ts — diacritic-,
// space- and punctuation-insensitive, so trivially different Vietnamese
// spellings still count as the same core prompt.
const normCore = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[?？.!,\s]+/g, ' ').trim();

export async function POST(req: NextRequest) {
  let body: {
    projectId?: string;
    competitorGroups?: any[];
    promptEdits?: {
      excluded?: string[];
      added?: (string | { text?: string; category?: string })[];
      rewrites?: { from?: string; to?: string; note?: string }[];
    };
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (!body.projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const auth = await authorize(body.projectId);
  if ('error' in auth) return auth.error;
  const meta: any = { ...(auth.project.metadata || {}) };
  const blockedCore: string[] = [];

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
    const core = new Set((Array.isArray(meta.coreKeyPrompts) ? meta.coreKeyPrompts : []).map(normCore));
    const guard = (p: string) => {
      if (!core.has(normCore(p))) return true;
      blockedCore.push(p);
      return false;
    };
    const excluded = clean(body.promptEdits.excluded).filter(guard);
    // Added prompts carry a funnel category (bare strings = legacy 'custom').
    const normAdded = (xs: any): { text: string; category: string }[] =>
      (Array.isArray(xs) ? xs : [])
        .map((a: any) => ({
          text: (typeof a === 'string' ? a : String(a?.text ?? '')).trim().slice(0, 300),
          category: (typeof a === 'string' ? '' : String(a?.category ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)) || 'custom',
        }))
        .filter((a) => a.text)
        .slice(0, 300);
    const added = normAdded(body.promptEdits.added);
    const rewrites = (Array.isArray(body.promptEdits.rewrites) ? body.promptEdits.rewrites : [])
      .map((r: any) => ({
        from: String(r?.from ?? '').trim().slice(0, 300),
        to: String(r?.to ?? '').trim().slice(0, 300),
        ...(r?.note ? { note: String(r.note).trim().slice(0, 300) } : {}),
      }))
      .filter((r) => r.from && r.to && normCore(r.from) !== normCore(r.to))
      .filter((r) => guard(r.from))
      .slice(0, 300);

    // Provenance log — one entry per change vs the previous state. This is the
    // operator team's localization dataset; never trim it below the cap.
    const prev = meta.promptEdits ?? {};
    const by = auth.user.email ?? auth.user.id;
    const at = new Date().toISOString();
    const log: any[] = Array.isArray(meta.promptEditLog) ? meta.promptEditLog : [];
    const norm = (s: string) => s.trim().toLowerCase();
    const diff = (before: string[], after: string[]) => ({
      gained: after.filter((x) => !before.some((y) => norm(y) === norm(x))),
      lost: before.filter((x) => !after.some((y) => norm(y) === norm(x))),
    });
    const ex = diff(prev.excluded ?? [], excluded);
    ex.gained.forEach((p) => log.push({ at, by, action: 'exclude', from: p }));
    ex.lost.forEach((p) => log.push({ at, by, action: 'restore', from: p }));
    const prevAdded = normAdded(prev.added);
    const ad = diff(prevAdded.map((a) => a.text), added.map((a) => a.text));
    ad.gained.forEach((p) => {
      const cat = added.find((a) => norm(a.text) === norm(p))?.category;
      log.push({ at, by, action: 'add', to: p, ...(cat && cat !== 'custom' ? { note: `group: ${cat}` } : {}) });
    });
    ad.lost.forEach((p) => log.push({ at, by, action: 'remove-added', from: p }));
    for (const a of added) {
      const old = prevAdded.find((x) => norm(x.text) === norm(a.text));
      if (old && old.category !== a.category) log.push({ at, by, action: 'recategorize', from: a.text, note: `${old.category} → ${a.category}` });
    }
    const prevRw = new Map(((prev.rewrites ?? []) as any[]).map((r: any) => [norm(String(r?.from ?? '')), r]));
    for (const r of rewrites) {
      const old = prevRw.get(norm(r.from));
      if (!old || String(old.to) !== r.to) log.push({ at, by, action: 'rewrite', from: r.from, to: r.to, ...(r.note ? { note: r.note } : {}) });
      prevRw.delete(norm(r.from));
    }
    for (const r of prevRw.values()) log.push({ at, by, action: 'revert-rewrite', from: String(r?.from ?? '') });

    meta.promptEdits = { excluded, added, rewrites };
    meta.promptEditLog = log.slice(-400);
  }

  const { error } = await auth.svc.from('projects').update({ metadata: meta }).eq('id', auth.project.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    competitorSet: meta.competitorSet ?? null,
    promptEdits: meta.promptEdits ?? null,
    ...(blockedCore.length ? { blockedCore } : {}),
  });
}
