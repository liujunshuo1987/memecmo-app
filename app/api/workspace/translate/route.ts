// POST /api/workspace/translate — translate a deliverable's text for review.
//
// Deliverables are generated in the client's market language (e.g. Vietnamese)
// because they ship to the end client. This lets the reviewer (founder / FMVN)
// read them in their own language WITHOUT changing the canonical deliverable.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { poeChat } from '@/lib/llm/poe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LANG_NAMES: Record<string, string> = {
  zh: 'Simplified Chinese',
  en: 'English',
  vi: 'Vietnamese',
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { text?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const to = LANG_NAMES[body.to ?? ''] ? body.to! : 'zh';
  const text = (body.text ?? '').slice(0, 12000); // bound cost/latency
  if (!text.trim()) return NextResponse.json({ error: 'No text' }, { status: 400 });

  try {
    const res = await poeChat({
      messages: [
        {
          role: 'system',
          content:
            `Translate the user's content into ${LANG_NAMES[to]} for review by a business ` +
            `stakeholder. Preserve Markdown structure, headings, lists, and any code/JSON ` +
            `blocks verbatim (do not translate inside code fences). Keep proper nouns, brand ` +
            `names, URLs, and numbers as-is. Output only the translation.`,
        },
        { role: 'user', content: text },
      ],
      maxTokens: 6000,
      temperature: 0.2,
    });
    return NextResponse.json({ translated: res.content, to });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
