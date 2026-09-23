// User edits that a re-run never overwrites (lib/edits.ts, table asset_edits).
//
// GET    ?projectId=&assetType=[&unitKey=]      → edits in force
// POST   { projectId, assetType, unitKey, value, baseValue? }  → save / replace
// DELETE ?projectId=&assetType=&unitKey=        → revert to the generated value
//
// Same authorisation as project-sets: the caller must be able to administer
// the project's org. All access is via the service client after that check.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAdminOrg } from '@/lib/org-auth';
import { isProfileUnit } from '@/lib/edits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOC_TYPES = new Set(['content_draft', 'distribution_kit', 'site_optimization', 'encyclopedia_entry']);
const MAX_VALUE_BYTES = 200_000;

function validUnit(assetType: string, unitKey: string): boolean {
  if (assetType === 'brand_profile') return isProfileUnit(unitKey);
  if (assetType === 'standard_answers') return /^answer:[0-9a-f]{16}:(local|en)$/.test(unitKey);
  if (DOC_TYPES.has(assetType)) return /^doc:[0-9a-f-]{36}$/.test(unitKey);
  return false;
}

async function authorize(projectId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const svc = serviceClient();
  const { data: project } = await svc
    .from('projects')
    .select('id, organization_id, organizations(id, parent_org_id)')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  const org: any = (project as any).organizations;
  if (!(await canAdminOrg(supabase, user.id, { id: org.id, parent_org_id: org.parent_org_id }))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { svc, user };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const projectId = q.get('projectId'), assetType = q.get('assetType'), unitKey = q.get('unitKey');
  if (!projectId || !assetType) return NextResponse.json({ error: 'Missing projectId or assetType' }, { status: 400 });
  const a = await authorize(projectId);
  if ('error' in a) return a.error;
  let sel = a.svc.from('asset_edits').select('unit_key, value, base_value, edited_at, source').eq('project_id', projectId).eq('asset_type', assetType);
  if (unitKey) sel = sel.eq('unit_key', unitKey);
  const { data, error } = await sel;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ edits: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: { projectId?: string; assetType?: string; unitKey?: string; value?: unknown; baseValue?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const { projectId, assetType, unitKey, value } = body;
  if (!projectId || !assetType || !unitKey || value === undefined) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (!validUnit(assetType, unitKey)) return NextResponse.json({ error: 'Not an editable unit' }, { status: 400 });
  if (JSON.stringify(value).length > MAX_VALUE_BYTES) return NextResponse.json({ error: 'Value too large' }, { status: 413 });
  const a = await authorize(projectId);
  if ('error' in a) return a.error;
  const { data, error } = await a.svc
    .from('asset_edits')
    .upsert(
      { project_id: projectId, asset_type: assetType, unit_key: unitKey, value, base_value: body.baseValue ?? null, edited_by: a.user.id, source: 'user', edited_at: new Date().toISOString() },
      { onConflict: 'project_id,asset_type,unit_key' },
    )
    .select('unit_key, value, edited_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, edit: data });
}

export async function DELETE(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const projectId = q.get('projectId'), assetType = q.get('assetType'), unitKey = q.get('unitKey');
  if (!projectId || !assetType || !unitKey) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const a = await authorize(projectId);
  if ('error' in a) return a.error;
  const { error } = await a.svc.from('asset_edits').delete().eq('project_id', projectId).eq('asset_type', assetType).eq('unit_key', unitKey);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reverted: unitKey });
}
