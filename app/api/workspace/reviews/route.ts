// Client verification requests (CMO review P1).
//
// POST /api/workspace/reviews  — an org member sends the brand profile /
//   prompt library / competitor set to the client for sign-off. Snapshots the
//   content, creates a tokenized review, emails the client (best-effort).
// GET  /api/workspace/reviews?projectId=&kind= — latest review per kind
//   (RLS-scoped; used by the workspace status chips).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { sendReviewEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, { en: string; vi: string; zh: string }> = {
  brand_profile: { en: 'Brand fact sheet', vi: 'Hồ sơ dữ kiện thương hiệu', zh: '品牌事实清单' },
  prompt_set: { en: 'Question library (prompts)', vi: 'Thư viện câu hỏi', zh: '核心问题库' },
  competitor_set: { en: 'Competitor list', vi: 'Danh sách đối thủ', zh: '竞品名单' },
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function buildSnapshot(sb: ReturnType<typeof serviceClient>, projectId: string, kind: string): Promise<Record<string, unknown> | null> {
  if (kind === 'competitor_set') {
    const { data } = await sb.from('projects').select('metadata').eq('id', projectId).maybeSingle();
    const set = (data?.metadata as any)?.competitorSet;
    return set ? { competitorSet: set } : null;
  }
  const type = kind === 'brand_profile' ? 'brand_profile' : 'prompt_set';
  const { data } = await sb
    .from('assets')
    .select('content')
    .eq('project_id', projectId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.content) return null;
  try {
    const parsed = JSON.parse(data.content);
    if (kind === 'brand_profile') {
      const { definition, description, category, services, differentiators, facts, nap, audience } = parsed;
      return { definition, description, category, services, differentiators, facts, nap, audience };
    }
    return { promptSet: parsed.promptSet ?? [], keyPrompts: parsed.keyPrompts ?? [] };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { projectId?: string; kind?: string; email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const email = body.email?.trim().toLowerCase();
  if (!body.projectId || !body.kind || !KIND_LABEL[body.kind]) {
    return NextResponse.json({ error: 'Missing projectId or invalid kind' }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'Valid client email required' }, { status: 400 });

  // Caller must see the project (RLS).
  const { data: project } = await supabase
    .from('projects')
    .select('id, brand_name')
    .eq('id', body.projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found or no access' }, { status: 404 });

  const sb = serviceClient();
  const snapshot = await buildSnapshot(sb, project.id, body.kind);
  if (!snapshot) {
    return NextResponse.json({ error: 'Nothing to review yet — run the corresponding agent first.' }, { status: 409 });
  }

  const { data: review, error } = await sb
    .from('asset_reviews')
    .insert({
      project_id: project.id,
      kind: body.kind,
      client_email: email,
      snapshot,
      requested_by: user.id,
    })
    .select('id, token, status, client_email, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const base = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const reviewUrl = `${base}/review/${review.token}`;
  const emailResult = await sendReviewEmail({
    to: email,
    brandName: project.brand_name,
    kindLabel: KIND_LABEL[body.kind],
    reviewUrl,
  });

  return NextResponse.json({
    ok: true,
    review: { ...review, token: undefined },
    reviewUrl,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? undefined : emailResult.error,
  });
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('projectId');
  const kind = req.nextUrl.searchParams.get('kind');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

  let q = supabase
    .from('asset_reviews')
    .select('kind, status, client_email, note, created_at, decided_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (kind) q = q.eq('kind', kind);
  const { data } = await q.limit(20);

  // Latest per kind.
  const latest: Record<string, unknown> = {};
  for (const r of data ?? []) if (!latest[r.kind]) latest[r.kind] = r;
  return NextResponse.json({ reviews: latest });
}
