import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getStripe, PLAN_FEATURES } from '@/lib/stripe';
import Stripe from 'stripe';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = headers().get('stripe-signature');

    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
    }

    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const planType = session.metadata?.plan_type || 'professional';
        const billingCycle = session.metadata?.billing_cycle || 'monthly';

        if (userId) {
          await supabaseAdmin
            .from('subscriptions')
            .update({
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              plan_type: planType,
              billing_cycle: billingCycle,
              status: 'active',
              current_period_start: new Date().toISOString(),
              current_period_end: new Date(
                Date.now() + (billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000
              ).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

          const quotaConfig = PLAN_FEATURES[planType as keyof typeof PLAN_FEATURES] || PLAN_FEATURES.professional;
          await supabaseAdmin
            .from('usage_quotas')
            .update({
              brands_limit: quotaConfig.brands_limit,
              visibility_scans_limit: quotaConfig.scans_limit,
              geo_audits_limit: quotaConfig.audits_limit,
              competitors_limit: quotaConfig.competitors_limit,
              api_calls_limit: quotaConfig.api_calls_limit,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

          await supabaseAdmin
            .from('payment_history')
            .insert({
              user_id: userId,
              stripe_payment_id: session.payment_intent as string,
              amount: (session.amount_total || 0) / 100,
              currency: session.currency || 'usd',
              status: 'succeeded',
              invoice_url: null,
            });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as unknown as Record<string, unknown>;
        const subscriptionId = invoice['subscription'] as string | undefined;

        if (subscriptionId) {
          const { data: sub } = await supabaseAdmin
            .from('subscriptions')
            .select('user_id, plan_type')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle();

          if (sub) {
            const amountPaid = (typeof invoice['amount_paid'] === 'number' ? invoice['amount_paid'] : 0) as number;
            await supabaseAdmin
              .from('payment_history')
              .insert({
                user_id: sub.user_id,
                stripe_payment_id: (invoice['payment_intent'] as string) || null,
                amount: amountPaid / 100,
                currency: (invoice['currency'] as string) || 'usd',
                status: 'succeeded',
                invoice_url: (invoice['hosted_invoice_url'] as string) || null,
              });

            await supabaseAdmin
              .from('usage_quotas')
              .update({
                visibility_scans_used: 0,
                geo_audits_used: 0,
                api_calls_used: 0,
                period_start: new Date().toISOString(),
                period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', sub.user_id);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const failedInvoice = event.data.object as unknown as Record<string, unknown>;
        const failedSubId = failedInvoice['subscription'] as string | undefined;

        if (failedSubId) {
          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', failedSubId);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const { data: sub } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscription.id)
          .maybeSingle();

        if (sub) {
          await supabaseAdmin
            .from('subscriptions')
            .update({
              plan_type: 'free',
              status: 'canceled',
              stripe_subscription_id: null,
              cancel_at_period_end: false,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', sub.user_id);

          const freeQuotas = PLAN_FEATURES.free;
          await supabaseAdmin
            .from('usage_quotas')
            .update({
              brands_limit: freeQuotas.brands_limit,
              visibility_scans_limit: freeQuotas.scans_limit,
              geo_audits_limit: freeQuotas.audits_limit,
              competitors_limit: freeQuotas.competitors_limit,
              api_calls_limit: freeQuotas.api_calls_limit,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', sub.user_id);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const planType = subscription.metadata?.plan_type;

        if (planType) {
          const { data: sub } = await supabaseAdmin
            .from('subscriptions')
            .select('user_id')
            .eq('stripe_subscription_id', subscription.id)
            .maybeSingle();

          if (sub) {
            await supabaseAdmin
              .from('subscriptions')
              .update({
                plan_type: planType,
                status: subscription.status === 'active' ? 'active' : subscription.status,
                cancel_at_period_end: subscription.cancel_at_period_end,
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', sub.user_id);

            if (planType in PLAN_FEATURES) {
              const quotaConfig = PLAN_FEATURES[planType as keyof typeof PLAN_FEATURES];
              await supabaseAdmin
                .from('usage_quotas')
                .update({
                  brands_limit: quotaConfig.brands_limit,
                  visibility_scans_limit: quotaConfig.scans_limit,
                  geo_audits_limit: quotaConfig.audits_limit,
                  competitors_limit: quotaConfig.competitors_limit,
                  api_calls_limit: quotaConfig.api_calls_limit,
                  updated_at: new Date().toISOString(),
                })
                .eq('user_id', sub.user_id);
            }
          }
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook handler failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
