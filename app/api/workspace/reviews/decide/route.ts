// POST /api/workspace/reviews/decide — the CLIENT approves or requests changes
// on a verification, authenticated by the review token (no login: the token
// was delivered to their email). Body: { token, action, note? }.

import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/commerce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { token?: string; action?: 'approve' | 'request_changes'; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (!body.token || !body.action || !['approve', 'request_changes'].includes(body.action)) {
    return NextResponse.json({ error: 'Missing token or action' }, { status: 400 });
  }
  if (body.action === 'request_changes' && !body.note?.trim()) {
    return NextResponse.json({ error: 'Please describe the changes needed' }, { status: 400 });
  }

  const sb = serviceClient();
  const { data: review } = await sb
    .from('asset_reviews')
    .select('id, status')
    .eq('token', body.token)
    .maybeSingle();
  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  if (review.status !== 'pending') {
    return NextResponse.json({ error: `Already ${review.status.replace('_', ' ')}` }, { status: 409 });
  }

  const { error } = await sb
    .from('asset_reviews')
    .update({
      status: body.action === 'approve' ? 'approved' : 'changes_requested',
      note: body.note?.trim() || null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', review.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
