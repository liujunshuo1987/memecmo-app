// Brand documents (CMO review P1): upload brand guidelines / positioning docs
// as grounding input for the content agents. We store extracted TEXT as an
// asset (type 'brand_doc') — the agents consume text, not binaries.
//
// POST   multipart form { file } → extract text (.txt/.md/.pdf) → asset
// GET    ?projectId= → list docs
// DELETE ?assetId=   → remove one

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_CHARS = 20000;

async function extractText(file: File): Promise<{ text: string; error?: string }> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return { text: buf.toString('utf8') };
  }
  if (name.endsWith('.pdf')) {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const r = await parser.getText();
      const text = (r.text || '').trim();
      if (text.replace(/\s|--? ?\d+ of \d+ ?--?/g, '').length < 40) {
        return { text: '', error: 'This PDF appears to be scanned images (no text layer). Please upload a text-based PDF, .txt or .md.' };
      }
      return { text };
    } catch (e) {
      return { text: '', error: `PDF parse failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  return { text: '', error: 'Unsupported file type — use .txt, .md or a text-based .pdf.' };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const projectId = form?.get('projectId');
  const file = form?.get('file');
  if (!form || typeof projectId !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: 'Expected multipart form with projectId + file' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 });

  // RLS: caller must see the project.
  const { data: project } = await supabase.from('projects').select('id, brand_name').eq('id', projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found or no access' }, { status: 404 });

  const { text, error } = await extractText(file);
  if (error) return NextResponse.json({ error }, { status: 422 });

  const sb = serviceClient();
  const { data: asset, error: insErr } = await sb
    .from('assets')
    .insert({
      project_id: project.id,
      type: 'brand_doc',
      title: file.name,
      format: 'text',
      content: text.slice(0, MAX_TEXT_CHARS),
      meta: { bytes: file.size, chars: Math.min(text.length, MAX_TEXT_CHARS), truncated: text.length > MAX_TEXT_CHARS, uploadedBy: user.id },
    })
    .select('id, title, created_at, meta')
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, doc: asset });
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const { data } = await supabase
    .from('assets')
    .select('id, title, created_at, meta')
    .eq('project_id', projectId)
    .eq('type', 'brand_doc')
    .order('created_at', { ascending: false })
    .limit(20);
  return NextResponse.json({ docs: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const assetId = req.nextUrl.searchParams.get('assetId');
  if (!assetId) return NextResponse.json({ error: 'Missing assetId' }, { status: 400 });
  // RLS check: caller must see the asset's project.
  const { data: asset } = await supabase.from('assets').select('id, project_id, type').eq('id', assetId).maybeSingle();
  if (!asset || asset.type !== 'brand_doc') return NextResponse.json({ error: 'Not found or no access' }, { status: 404 });

  const sb = serviceClient();
  await sb.from('assets').delete().eq('id', assetId);
  return NextResponse.json({ ok: true });
}
