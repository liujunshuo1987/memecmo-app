// Public pricing — Plans · Credits · Service items.
//
// Numbers come from the `plans` table (the same rows the dashboard billing
// modal and Stripe use); words come from lib/plans-catalog.ts. Rendered by
// pricing-client.tsx with a zh / en / vi switch.

import type { Metadata } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { CREDIT_PACKS } from '@/lib/credits';
import type { PlanRowLike } from '@/lib/plans-catalog';
import PricingClient from './pricing-client';

export const metadata: Metadata = {
  title: 'Plans, credits & service items — MemeCMO GEO Platform',
  description:
    'Starter, Growth and Scale plans per brand × market: scan cadence, prompt panel, AI engines, reports and deliverables in detail; credits for on-demand runs; billing rules and the promise boundary.',
  alternates: { canonical: 'https://app.memecmo.ai/pricing' },
};

export const revalidate = 600;

const PLAN_COLS =
  'id, name, region, price_usd_month, monthly_scan_quota, max_projects, included_credits_monthly, scan_cadence, prompt_library_cap, sampled_per_scan, engines, features, stripe_price_id, sort';

async function loadPlans(): Promise<PlanRowLike[]> {
  // The catalogue is public (anon SELECT policy); the service role is only a
  // fallback so an RLS regression can never blank the public quote.
  try {
    const sb = createClient();
    const { data } = await sb.from('plans').select(PLAN_COLS).order('sort');
    if (data && data.length) return data as PlanRowLike[];
  } catch { /* fall through */ }
  const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await svc.from('plans').select(PLAN_COLS).order('sort');
  return (data ?? []) as PlanRowLike[];
}

export default async function PricingPage() {
  const plans = await loadPlans();
  const packs = Object.entries(CREDIT_PACKS).map(([key, p]) => ({ key, credits: p.credits, usd: p.usd }));
  return <PricingClient plans={plans} packs={packs} />;
}
