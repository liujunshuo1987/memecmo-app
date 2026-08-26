// POST /api/workspace/projects — create a project under an organization
// GET  /api/workspace/projects?org=<orgSlug> — list projects for an org

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CreateProjectBody {
  organizationSlug: string;
  slug: string;             // project slug, unique within the org
  brandName: string;
  brandUrl?: string;
  targetCountry: string;    // 'Vietnam', 'Thailand', ...
  targetLanguage?: string;  // 'vi', 'th', ...
  industry?: string;
  productLine?: string;     // optional third axis: brand × product line × market
  description?: string;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CreateProjectBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const required = ['organizationSlug', 'slug', 'brandName', 'targetCountry'] as const;
  for (const k of required) {
    if (!body[k] || typeof body[k] !== 'string') {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }

  // Find the org (RLS hides orgs the user can't see, so non-members → 404)
  const { data: org } = await supabase
    .from('organizations')
    .select('id, status, type, metadata')
    .eq('slug', body.organizationSlug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ error: 'Organization not found or no access' }, { status: 404 });
  }
  if (org.status !== 'active') {
    return NextResponse.json(
      { error: `Organization is ${org.status} — projects can only be created in active orgs.` },
      { status: 403 },
    );
  }

  // Region fence: SEA countries, US states and the Traditional-Chinese line
  // (Hong Kong / Taiwan, 觀瀾智庫 white-label channel) are separate product
  // lines. A non-root org is locked to its region (metadata.region: 'us' |
  // 'hant' | default SEA) — enforced here, not just hidden in the picker UI.
  if (org.type !== 'root') {
    const marketRegion = /,\s*US$/i.test(body.targetCountry)
      ? 'us'
      : body.targetCountry === 'Hong Kong' || body.targetCountry === 'Taiwan'
        ? 'hant'
        : 'sea';
    const r = (org.metadata as any)?.region;
    const orgRegion = r === 'us' || r === 'hant' ? r : 'sea';
    if (marketRegion !== orgRegion) {
      const label = { us: 'US', hant: 'Hong Kong & Taiwan', sea: 'Southeast Asia' }[orgRegion];
      return NextResponse.json(
        { error: `This organization is on the ${label} line — market "${body.targetCountry}" is outside it.` },
        { status: 403 },
      );
    }
  }

  // Insert. RLS policy requires the user be admin/editor of the org.
  const { data: project, error: insertError } = await supabase
    .from('projects')
    .insert({
      organization_id: org.id,
      slug: body.slug,
      brand_name: body.brandName,
      brand_url: body.brandUrl ?? null,
      target_country: body.targetCountry,
      target_language: body.targetLanguage ?? null,
      industry: body.industry ?? null,
      description: body.description ?? null,
      created_by: user.id,
      // Kept out of `industry` so cards/UI show the clean value; agents get
      // the composed scope at run time (inngest load-project).
      ...(body.productLine ? { metadata: { productLine: body.productLine } } : {}),
    })
    .select('*')
    .single();

  if (insertError) {
    const msg = insertError.message || 'Insert failed';
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'Project slug already exists in this organization' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, project });
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgSlug = req.nextUrl.searchParams.get('org');
  if (!orgSlug) {
    return NextResponse.json({ error: 'Missing ?org=<slug>' }, { status: 400 });
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ error: 'Organization not found or no access' }, { status: 404 });
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('organization_id', org.id)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false });

  return NextResponse.json({ projects: projects ?? [] });
}
