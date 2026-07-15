// POST /api/workspace/billing/portal — open the Stripe Billing Portal for an
// org (manage card / cancel / invoices). Body: { orgId }.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAdminOrg } from '@/lib/org-auth';
import { isBillingConfigured, getStripe } from '@/lib/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isBillingConfigured()) {
    return NextResponse.json(
      { error: 'billing_not_configured', message: 'Payments are not yet enabled on this deployment.' },
      { status: 503 },
    );
  }

  let body: { orgId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (!body.orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

  const { data: org } = await supabase
    .from('organizations')
    .select('id, parent_org_id')
    .eq('id', body.orgId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: 'Org not found or no access' }, { status: 404 });
  if (!(await canAdminOrg(supabase, user.id, org))) {
    return NextResponse.json({ error: 'Only an admin can manage billing' }, { status: 403 });
  }

  const sb = serviceClient();
  const { data: sub } = await sb
    .from('org_subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', org.id)
    .maybeSingle();
  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account yet — subscribe to a plan first.' }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${base}/dashboard`,
  });
  return NextResponse.json({ ok: true, url: session.url });
}
