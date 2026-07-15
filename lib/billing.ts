// Stripe billing (③ commercial) — ORG-level subscriptions (Option B: MemeCMO
// bills end clients directly; the channel share is settled offline monthly).
//
// Degrades gracefully: until real keys are configured every endpoint answers
// with a clear "billing not configured" instead of crashing. Bootstrap the
// Stripe catalog once with scripts/stripe-bootstrap.mjs after adding keys.

import Stripe from 'stripe';
import { serviceClient } from './commerce';

/** True when a real secret key is present (not the placeholder). */
export function isBillingConfigured(): boolean {
  const k = process.env.STRIPE_SECRET_KEY || '';
  return k.startsWith('sk_') && k.length > 20;
}

export function getStripe(): Stripe {
  // SDK-pinned API version (v21 "basil" era). Period fields live on the
  // subscription ITEM in this shape; readers below fall back to the legacy
  // top-level fields for older event payloads.
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { typescript: true });
}

function subPeriod(subscription: Stripe.Subscription): { start: number; end: number } {
  const item = subscription.items?.data?.[0] as any;
  const legacy = subscription as any;
  return {
    start: item?.current_period_start ?? legacy.current_period_start ?? Math.floor(Date.now() / 1000),
    end: item?.current_period_end ?? legacy.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 86400,
  };
}

/** Get or create the Stripe customer for an org; persisted on org_subscriptions. */
export async function ensureStripeCustomer(orgId: string, orgName: string, email?: string | null): Promise<string> {
  const sb = serviceClient();
  const { data: sub } = await sb
    .from('org_subscriptions')
    .select('id, stripe_customer_id')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (sub?.stripe_customer_id) return sub.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: orgName,
    email: email || undefined,
    metadata: { orgId },
  });
  if (sub) {
    await sb.from('org_subscriptions').update({ stripe_customer_id: customer.id }).eq('id', sub.id);
  } else {
    await sb.from('org_subscriptions').insert({
      organization_id: orgId,
      plan_id: 'standard',
      status: 'trialing',
      stripe_customer_id: customer.id,
    });
  }
  return customer.id;
}

/** Map a Stripe subscription status onto our enum. */
export function mapStripeStatus(s: Stripe.Subscription.Status): 'trialing' | 'active' | 'past_due' | 'canceled' {
  switch (s) {
    case 'trialing': return 'trialing';
    case 'active': return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete': return 'past_due';
    default: return 'canceled'; // canceled, incomplete_expired, paused
  }
}

/** Sync one Stripe subscription object into org_subscriptions. */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const sb = serviceClient();
  const orgId = subscription.metadata?.orgId;
  const priceId = subscription.items.data[0]?.price?.id;

  // Resolve plan from the price.
  let planId: string | null = null;
  if (priceId) {
    const { data: plan } = await sb.from('plans').select('id').eq('stripe_price_id', priceId).maybeSingle();
    planId = plan?.id ?? null;
  }

  const patch: Record<string, unknown> = {
    status: mapStripeStatus(subscription.status),
    stripe_subscription_id: subscription.id,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    current_period_start: new Date(subPeriod(subscription).start * 1000).toISOString(),
    current_period_end: new Date(subPeriod(subscription).end * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (planId) patch.plan_id = planId;

  if (orgId) {
    const { data: existing } = await sb.from('org_subscriptions').select('id').eq('organization_id', orgId).maybeSingle();
    if (existing) {
      await sb.from('org_subscriptions').update(patch).eq('id', existing.id);
    } else {
      await sb.from('org_subscriptions').insert({ organization_id: orgId, plan_id: planId ?? 'standard', ...patch });
    }
    return;
  }
  // Fallback: match by subscription id (metadata missing on older objects).
  await sb.from('org_subscriptions').update(patch).eq('stripe_subscription_id', subscription.id);
}
