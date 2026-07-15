// POST /api/workspace/billing/checkout — start a Stripe subscription checkout
// for an end-client org. Body: { orgId, planId }. Caller must be an admin of
// the org, its parent channel partner, or root (Option B: the channel may
// initiate on the client's behalf; MemeCMO's Stripe account collects).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAdminOrg } from '@/lib/org-auth';
import { isBillingConfigured, getStripe, ensureStripeCustomer } from '@/lib/billing';

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

  let body: { orgId?: string; planId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (!body.orgId || !body.planId) return NextResponse.json({ error: 'Missing orgId or planId' }, { status: 400 });

  // Org must be visible to the caller and be an end client.
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, type, parent_org_id, billing_email')
    .eq('id', body.orgId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: 'Org not found or no access' }, { status: 404 });
  if (org.type !== 'end_client') {
    return NextResponse.json({ error: 'Only end-client organizations are billed' }, { status: 400 });
  }
  if (!(await canAdminOrg(supabase, user.id, org))) {
    return NextResponse.json({ error: 'Only an admin can manage billing' }, { status: 403 });
  }

  const sb = serviceClient();
  const { data: plan } = await sb
    .from('plans')
    .select('id, name, stripe_price_id, price_usd_month')
    .eq('id', body.planId)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });
  if (!plan.stripe_price_id) {
    return NextResponse.json(
      { error: 'plan_not_bootstrapped', message: 'Stripe catalog not initialized — run scripts/stripe-bootstrap.mjs.' },
      { status: 503 },
    );
  }

  const customer = await ensureStripeCustomer(org.id, org.name, org.billing_email || user.email);
  const base = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    subscription_data: { metadata: { orgId: org.id, planId: plan.id } },
    metadata: { orgId: org.id, planId: plan.id },
    allow_promotion_codes: true,
    success_url: `${base}/dashboard?billing=success`,
    cancel_url: `${base}/dashboard?billing=canceled`,
  });

  return NextResponse.json({ ok: true, url: session.url });
}
