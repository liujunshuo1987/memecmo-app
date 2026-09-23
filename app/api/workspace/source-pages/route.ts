// Cited-page features per domain (lib/pages), aggregated in SQL.
//
// GET  ?projectId=[&domains=a.com,b.vn]  → { domains: [{ domain, pages, fetched, schemaPages, faqPages, datedPages, lastModified, avgWords, blocked }] }
// POST { projectId, limit } → operator only: enqueue a fetch/backfill run
//
// Authorisation: GET rides on the tables' own RLS through the user's session
// client (geo_citations is project-visible, geo_pages features are public
// web data); POST is root-org members only.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isOperator } from '@/lib/org-auth';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Bounded by the domains the caller shows (≤200); without a list, the 300 most-cited domains.
  const wanted = (req.nextUrl.searchParams.get('domains') || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean).slice(0, 200);
  const { data, error } = await supabase.rpc('geo_domain_pages', { p_project_id: projectId, p_domains: wanted.length ? wanted : null, p_limit: 300 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const domains = ((data ?? []) as any[]).map((r) => ({
    domain: String(r.domain), pages: Number(r.pages), fetched: Number(r.fetched), schemaPages: Number(r.schema_pages), faqPages: Number(r.faq_pages),
    datedPages: Number(r.dated_pages), lastModified: r.last_modified ?? null, avgWords: r.avg_words == null ? null : Number(r.avg_words), blocked: Number(r.blocked),
  }));
  return NextResponse.json({ domains });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isOperator(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body: { projectId?: string; limit?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const limit = Math.min(1000, Math.max(1, Number(body.limit ?? 150)));
  await inngest.send({ name: 'geo/pages.fetch', data: { projectId: body.projectId ?? null, limit, by: user.email ?? user.id } });
  return NextResponse.json({ ok: true, projectId: body.projectId ?? null, limit });
}
