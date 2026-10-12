// Operator-only: run suggested-action detection for a project now and post the
// pending suggestions to its Lark group as the one-tap card. Mirrors the end of
// the pages-fetch function; exists so an operator can push the first card
// without waiting for the next scan. Lark credentials live only in production.
//
// POST { projectId, detect?: boolean (default true), post?: boolean (default true) }  — post = keep the living card now (hours gate skipped)
//   → { detection: { added, closed }, pending, posted }
// Requires a signed-in root-org member (isOperator). The card itself says who
// approved the send: the operator's email.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { isOperator } from '@/lib/org-auth';
import { loadPendingSuggestions, runDetection, unreadOwnPages } from '@/lib/suggestions';
import { fetchBatch } from '@/lib/pages/queue';
import { keepSuggestionCard } from '@/lib/lark-bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isOperator(supabase, user.id))) return NextResponse.json({ error: 'Operators only' }, { status: 403 });
  let body: { projectId?: string; detect?: boolean; post?: boolean } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body.projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const sb = serviceClient();
  const out: Record<string, unknown> = {};
  if (body.detect !== false) {
    try {
      const unread = await unreadOwnPages(sb, body.projectId, 24);
      for (let i = 0; i < unread.length; i += 12) await fetchBatch(sb, unread.slice(i, i + 12) as any);
      out.detection = await runDetection(sb, body.projectId);
    } catch (e) {
      out.detection = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  const pending = await loadPendingSuggestions(sb, body.projectId);
  out.pending = pending.map((s) => ({ seq: s.seq, url: s.url, title: s.title, published_guess: s.published_guess, posted: !!s.lark_posted_at }));
  if (body.post !== false) {
    try { out.posted = await keepSuggestionCard(sb, { projectId: body.projectId, approvedBy: user.email ?? user.id, force: true }); }
    catch (e) { out.posted = `error:${e instanceof Error ? e.message : String(e)}`; }
  }
  return NextResponse.json(out);
}
