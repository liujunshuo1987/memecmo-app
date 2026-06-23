import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    _stripe = new Stripe(key, {
      apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return _stripe;
}

export const PLAN_FEATURES = {
  free: {
    brands_limit: 1,
    scans_limit: 5,
    audits_limit: 3,
    competitors_limit: 1,
    api_calls_limit: 0,
  },
  professional: {
    brands_limit: 5,
    scans_limit: 50,
    audits_limit: 20,
    competitors_limit: 5,
    api_calls_limit: 500,
  },
  enterprise: {
    brands_limit: 9999,
    scans_limit: 9999,
    audits_limit: 9999,
    competitors_limit: 9999,
    api_calls_limit: 9999,
  },
} as const;
