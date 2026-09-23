// CSV export of the golden pool for external labellers (operator-only).
// Blind by default: machine labels are omitted unless ?blind=0.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { isOperator } from '@/lib/org-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isOperator(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const language = req.nextUrl.searchParams.get('language') ?? 'vi';
  const blind = req.nextUrl.searchParams.get('blind') !== '0';
  const { data } = await serviceClient().from('golden_pool')
    .select('id, engine, model, stage, intent, key_prompt, prompt, answer_text, brand_name, competitor_names, machine, created_at')
    .eq('language', language).order('created_at').limit(5000);
  const head = ['id', 'engine', 'stage', 'intent', 'key_prompt', 'brand_name', 'tracked_competitors', 'prompt', 'answer_text', 'LABEL_brand_mentioned', 'LABEL_prominence_0_3', 'LABEL_sentiment', 'LABEL_competitors', 'LABEL_notes', ...(blind ? [] : ['machine_brandMentioned', 'machine_prominence', 'machine_sentiment', 'machine_competitors'])];
  const lines = [head.join(',')];
  for (const r of data ?? []) {
    lines.push([r.id, r.engine, r.stage, r.intent, r.key_prompt, r.brand_name, (r.competitor_names ?? []).join('; '), r.prompt, r.answer_text, '', '', '', '', '',
      ...(blind ? [] : [r.machine?.brandMentioned, r.machine?.prominence, r.machine?.sentiment, (r.machine?.competitors ?? []).join('; ')])].map(csv).join(','));
  }
  return new NextResponse('﻿' + lines.join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="golden_${language}_${new Date().toISOString().slice(0, 10)}.csv"` } });
}
