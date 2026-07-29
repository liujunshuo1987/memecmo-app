// Credits API — balance/ledger for members, pack purchase for admins.
//
//   GET  ?orgId=            → { balance, ledger[] } (RLS: members of the org)
//   POST { orgId, pack }    → Stripe Checkout (one-time payment) for a credit
//                             pack; fulfilment happens in the Stripe webhook.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import { canAdminOrg } from '@/lib/org-auth';
import { isBillingConfigured, getStripe, ensureStripeCustomer } from '@/lib/billing';
import { getCreditBalance, CREDIT_PACKS } from '@/lib/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.memecmo.ai';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });

  // Ledger reads go through the AUTHED client so RLS scopes to membership.
  const { data: ledger, error } = await supabase
    .from('credit_ledger')
    .select('pool, delta, kind, reason, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const balance = await getCreditBalance(serviceClient(), orgId);
  return NextResponse.json({ balance, ledger: ledger ?? [], packs: CREDIT_PACKS });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isBillingConfigured()) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }

  let body: { orgId?: string; pack?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const pack = body.pack ? CREDIT_PACKS[body.pack] : null;
  if (!body.orgId || !pack) return NextResponse.json({ error: 'Missing orgId or unknown pack' }, { status: 400 });

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, parent_org_id, billing_email')
    .eq('id', body.orgId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: 'Org not found or no access' }, { status: 404 });
  if (!(await canAdminOrg(supabase, user.id, org))) {
    return NextResponse.json({ error: 'Only org admins can purchase credits' }, { status: 403 });
  }

  const stripe = getStripe();
  const customer = await ensureStripeCustomer(org.id, org.name, org.billing_email ?? user.email);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: pack.usd * 100,
        product_data: { name: `MemeCMO Credits — ${pack.label}` },
      },
    }],
    metadata: { orgId: org.id, credits: String(pack.credits), pack: body.pack! },
    success_url: `${APP_URL}/dashboard?credits=success`,
    cancel_url: `${APP_URL}/dashboard?credits=cancelled`,
  });

  return NextResponse.json({ ok: true, url: session.url });
}
