// POST /api/workspace/ask — advisory Q&A over a measurement result.
//
// A-class deliverables (Monitor / Report) are read-and-analyze, not edit. This
// answers a stakeholder question grounded ONLY in that result's data + the
// canonical brand profile, and (when useful) names the execution agent that
// would act on the answer — so the user can derive an action from the insight.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { poeChat } from '@/lib/llm/poe';
import { brandProfileBlock } from '@/lib/agents/brand-facts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { projectId?: string; agentId?: string; question?: string; resultDigest?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const { projectId, question, resultDigest } = body;
  if (!projectId || !question?.trim()) {
    return NextResponse.json({ error: 'Missing projectId or question' }, { status: 400 });
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, brand_name, target_country')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found or no access' }, { status: 404 });

  let brandProfile: unknown = null;
  const { data: bp } = await supabase
    .from('assets').select('content').eq('project_id', projectId).eq('type', 'brand_profile')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (bp?.content) { try { brandProfile = JSON.parse(bp.content); } catch { /* ignore */ } }

  const system =
    'You are a senior GEO (Generative Engine Optimization) analyst. Answer the user’s ' +
    'question about the GEO result below, grounded ONLY in the provided data and brand ' +
    'facts — do not invent numbers. Be concise (2-5 sentences) and specific. When an ' +
    'action would clearly help, end with one line "Next: <Optimize|Site|Distribute|' +
    'Encyclopedia> — <why>" naming the single best execution agent. Answer in the same ' +
    'language as the question.';

  const userMsg = [
    `Brand: ${project.brand_name} · ${project.target_country}`,
    brandProfileBlock(brandProfile) || null,
    '',
    'GEO RESULT DATA:',
    (resultDigest || '').slice(0, 12000),
    '',
    `QUESTION: ${question.trim()}`,
  ].filter((l) => l !== null).join('\n');

  try {
    const res = await poeChat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      maxTokens: 1200,
      temperature: 0.3,
    });
    // Detect a suggested agent from the "Next: <Agent>" line.
    const m = res.content.match(/Next:\s*(Optimize|Site|Distribute|Encyclopedia)/i);
    const suggestedAgent = m ? m[1].toLowerCase() : null;
    return NextResponse.json({ answer: res.content, suggestedAgent });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
