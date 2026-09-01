// Stripe webhook — the single source of truth for subscription state.
// Configure in Stripe Dashboard → Webhooks:
//   endpoint  https://app.memecmo.ai/api/webhooks/stripe
//   events    checkout.session.completed, customer.subscription.updated,
//             customer.subscription.deleted, invoice.payment_failed
// Signature verified with STRIPE_WEBHOOK_SECRET (raw body required).

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { serviceClient } from '@/lib/commerce';
import { isBillingConfigured, getStripe, syncSubscription } from '@/lib/billing';
import { addPurchasedCredits, applyPlanAllowance } from '@/lib/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isBillingConfigured()) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  const whsec = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!whsec.startsWith('whsec_') || whsec.length < 20) {
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = stripe.webhooks.constructEvent(raw, sig, whsec);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subId);
          // Carry org/plan metadata from the session if the subscription lacks it.
          if (!subscription.metadata?.orgId && session.metadata?.orgId) {
            subscription.metadata = { ...subscription.metadata, ...session.metadata };
          }
          await syncSubscription(subscription);
          // First activation: grant the first month's included credits NOW —
          // the monthly cron only fires on the 1st, and a new subscriber must
          // not sit at zero balance until then. applyPlanAllowance tops the
          // granted pool up to the plan's allowance, so webhook retries are
          // harmless. Renewal top-ups stay with the cron.
          const orgId = subscription.metadata?.orgId;
          if (orgId) {
            const sb = serviceClient();
            const { data: sub } = await sb
              .from('org_subscriptions')
              .select('plan_id, plans(included_credits_monthly)')
              .eq('organization_id', orgId)
              .maybeSingle();
            const included = Number((sub?.plans as any)?.included_credits_monthly ?? 0);
            if (included > 0) await applyPlanAllowance(sb, orgId, included);
            // Self-serve trial → paying customer: lift the preview fences.
            const { data: org } = await sb.from('organizations').select('metadata').eq('id', orgId).maybeSingle();
            if ((org?.metadata as any)?.trial) {
              await sb.from('organizations').update({ metadata: { ...(org!.metadata as any), trial: false } }).eq('id', orgId);
            }
          }
        } else if (session.mode === 'payment' && session.payment_status === 'paid' && session.metadata?.orgId && session.metadata?.credits) {
          // Credit pack purchase — fulfil into the purchased pool (idempotent
          // on the session id; Stripe retries webhooks).
          await addPurchasedCredits(serviceClient(), session.metadata.orgId, Number(session.metadata.credits), `stripe:${session.id}`);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any; // subscription ref moved across API versions
        const subId: string | undefined =
          (typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id) ??
          invoice.parent?.subscription_details?.subscription;
        if (subId) {
          const sb = serviceClient();
          await sb.from('org_subscriptions').update({ status: 'past_due', updated_at: new Date().toISOString() }).eq('stripe_subscription_id', subId);
        }
        break;
      }
      default:
        break; // acknowledged, unhandled
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.type}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'handler error' }, { status: 500 }); // Stripe will retry
  }

  return NextResponse.json({ received: true });
}
