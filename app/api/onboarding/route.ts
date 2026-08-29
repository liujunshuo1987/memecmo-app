// POST /api/onboarding — self-serve trial funnel entry (spec 2026-09).
//
// One call takes a fresh signed-up user to a working trial workspace:
//   1. guards: flag, rate limit, one-org-per-user, one-preview-per-domain
//   2. creates org (trial) + admin membership + project
//   3. dispatches an UNCHARGED preview full_scan (2 engines × 8 prompts —
//      policy applied inside run.ts via trigger_method='preview')
//
// Runs on the service role throughout: the caller is not a member of any org
// yet, so RLS would reject every insert (same pattern as /demo).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRateLimit } from '@/lib/api-guard';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface OnboardingBody {
  brandName: string;
  brandUrl: string;
  market: string;      // 'Vietnam' | 'Thailand' | ... | 'California, US' | ...
  language?: string;
}

const SLUG_SAFE = /[^a-z0-9-]+/g;

function slugify(name: string): string {
  const base = name.toLowerCase().trim().replace(/\s+/g, '-').replace(SLUG_SAFE, '').slice(0, 32) || 'brand';
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeDomain(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (process.env.SELF_SERVE_ENABLED !== '1') {
    return NextResponse.json({ error: 'self_serve_disabled' }, { status: 403 });
  }

  // 3 attempts per IP per day — a preview costs real engine calls.
  const limited = await requireRateLimit(req, { scope: 'onboarding', limit: 3, windowMs: 86_400_000 });
  if (limited) return limited;

  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: OnboardingBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  for (const k of ['brandName', 'brandUrl', 'market'] as const) {
    if (!body[k] || typeof body[k] !== 'string') {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }
  const domain = normalizeDomain(body.brandUrl);
  if (!domain) {
    return NextResponse.json({ error: 'invalid_url', message: 'brandUrl is not a valid domain.' }, { status: 400 });
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // One self-serve org per user — existing members go to their workspace.
  const { data: membership } = await svc
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (membership) {
    return NextResponse.json(
      { error: 'already_member', message: 'This account already belongs to an organization.' },
      { status: 409 },
    );
  }

  // One free preview per brand domain, globally. Insert-first: the PK makes
  // this the race-safe gate (two concurrent signups → second insert fails).
  const { error: domainError } = await svc
    .from('preview_domains')
    .insert({ domain, user_email: user.email ?? null });
  if (domainError) {
    return NextResponse.json(
      { error: 'domain_previewed', message: 'This brand already has a preview. Log in to the original account, or contact us.' },
      { status: 409 },
    );
  }

  const region = /,\s*US$/i.test(body.market) ? 'us' : 'sea';
  const orgSlug = slugify(body.brandName);

  const { data: org, error: orgError } = await svc
    .from('organizations')
    .insert({
      slug: orgSlug,
      name: body.brandName,
      type: 'end_client',
      status: 'active',
      billing_email: user.email ?? null,
      metadata: { trial: true, selfServe: true, region, previewUsed: true },
    })
    .select('id, slug')
    .single();
  if (orgError || !org) {
    await svc.from('preview_domains').delete().eq('domain', domain);
    return NextResponse.json({ error: orgError?.message || 'org_create_failed' }, { status: 500 });
  }
  await svc.from('preview_domains').update({ organization_id: org.id }).eq('domain', domain);

  await svc.from('organization_members').insert({ organization_id: org.id, user_id: user.id, role: 'admin' });

  const { data: project, error: projError } = await svc
    .from('projects')
    .insert({
      organization_id: org.id,
      slug: 'main',
      brand_name: body.brandName,
      brand_url: /^https?:\/\//i.test(body.brandUrl) ? body.brandUrl : `https://${body.brandUrl}`,
      target_country: body.market,
      target_language: body.language ?? null,
      created_by: user.id,
    })
    .select('id, slug')
    .single();
  if (projError || !project) {
    return NextResponse.json({ error: projError?.message || 'project_create_failed' }, { status: 500 });
  }

  const { data: run, error: runError } = await svc
    .from('agent_runs')
    .insert({
      project_id: project.id,
      agent_id: 'full_scan',
      triggered_by: user.id,
      trigger_method: 'preview',
      status: 'queued',
    })
    .select('id')
    .single();
  if (runError || !run) {
    return NextResponse.json({ error: runError?.message || 'run_create_failed' }, { status: 500 });
  }

  try {
    await inngest.send({
      name: 'agent/run.requested',
      data: { runId: run.id, agentId: 'full_scan', projectId: project.id },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await svc.from('agent_runs').update({ status: 'failed', error_message: `enqueue: ${msg}` }).eq('id', run.id);
    return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
  }

  await svc.from('funnel_events').insert([
    { organization_id: org.id, event: 'onboarding_start', meta: { market: body.market } },
    { organization_id: org.id, event: 'preview_dispatched', meta: { domain, runId: run.id } },
  ]);

  return NextResponse.json({ ok: true, orgSlug: org.slug, projectSlug: project.slug, runId: run.id });
}
