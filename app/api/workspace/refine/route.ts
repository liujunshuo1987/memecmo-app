// POST /api/workspace/refine — conversational refinement of a content artifact.
//
// The "dialogue → generate" path: the user gives an instruction ("make it
// punchier", "add our pricing", "this claim is wrong"), and we revise the
// CURRENT artifact (not regenerate from scratch), grounded in the canonical
// brand profile so facts stay consistent. Synchronous (short, interactive) —
// no Inngest. Returns the revised artifact; the sandbox keeps versions.

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

  let body: { projectId?: string; artifactType?: string; currentContent?: string; instruction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const { projectId, currentContent, instruction } = body;
  if (!projectId || !currentContent || !instruction?.trim()) {
    return NextResponse.json({ error: 'Missing projectId, currentContent or instruction' }, { status: 400 });
  }

  // RLS gate: the user must be able to see the project.
  const { data: project } = await supabase
    .from('projects')
    .select('id, brand_name, target_country, target_language')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found or no access' }, { status: 404 });

  // Canonical brand facts for consistency.
  let brandProfile: unknown = null;
  const { data: bp } = await supabase
    .from('assets')
    .select('content')
    .eq('project_id', projectId)
    .eq('type', 'brand_profile')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (bp?.content) { try { brandProfile = JSON.parse(bp.content); } catch { /* ignore */ } }

  const facts = brandProfileBlock(brandProfile);
  const system =
    'You are revising an existing GEO content artifact (Markdown). Apply the user’s ' +
    'instruction to the CURRENT draft — edit it, do not regenerate from scratch or drop ' +
    'unrelated sections. Keep it publish-ready and in the same language as the current ' +
    'draft unless the instruction says otherwise. Stay factually consistent with the ' +
    'canonical brand facts. Return ONLY the full revised Markdown artifact, nothing else.';

  const userMsg = [
    facts || null,
    facts ? '' : null,
    'CURRENT DRAFT:',
    '"""',
    currentContent.slice(0, 16000),
    '"""',
    '',
    `INSTRUCTION: ${instruction.trim()}`,
  ].filter((l) => l !== null).join('\n');

  try {
    const res = await poeChat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      maxTokens: 6000,
      temperature: 0.5,
    });
    return NextResponse.json({ content: res.content });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
