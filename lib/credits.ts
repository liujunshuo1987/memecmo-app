// Credit system — the "flexibility product" (shareholder-approved 2026-07).
//
// Double pool: 'granted' (gifts/monthly allowances — spent FIRST, never
// refunded or invoiced) vs 'purchased' (Stripe credit packs — invoiceable).
// All writes go through the service role; balances are ledger sums.
//
// Action prices (credits denominate ACTIONS; repricing touches only this map):
//   full scan 25 · monitor 25 · report regen 10 · content agents 10 · discovery 10

import type { SupabaseClient } from '@supabase/supabase-js';

export const CREDIT_COSTS: Record<string, number> = {
  full_scan: 25,
  monitor: 25,
  report: 10,
  discovery: 10,
  answers: 10,
  optimize: 10,
  site: 10,
  distribute: 10,
  encyclopedia: 10,
  schema: 10,
};

export interface CreditBalance {
  granted: number;
  purchased: number;
  total: number;
}

export async function getCreditBalance(sb: SupabaseClient, orgId: string): Promise<CreditBalance> {
  const { data } = await sb
    .from('credit_ledger')
    .select('pool, delta')
    .eq('organization_id', orgId);
  let granted = 0;
  let purchased = 0;
  for (const r of data ?? []) {
    if (r.pool === 'granted') granted += r.delta;
    else purchased += r.delta;
  }
  return { granted, purchased, total: granted + purchased };
}

/**
 * Spend credits: granted pool first, then purchased. Returns the post-spend
 * balance, or { ok: false } untouched when the total is insufficient.
 * (App-level check-then-insert — fine at current scale; revisit with volume.)
 */
export async function spendCredits(
  sb: SupabaseClient,
  orgId: string,
  amount: number,
  reason: string,
  agentRunId?: string,
): Promise<{ ok: boolean; balance: CreditBalance }> {
  const bal = await getCreditBalance(sb, orgId);
  if (bal.total < amount) return { ok: false, balance: bal };

  const fromGranted = Math.min(bal.granted, amount);
  const fromPurchased = amount - fromGranted;
  const rows = [];
  if (fromGranted > 0) rows.push({ organization_id: orgId, pool: 'granted', delta: -fromGranted, kind: 'spend', reason, agent_run_id: agentRunId ?? null });
  if (fromPurchased > 0) rows.push({ organization_id: orgId, pool: 'purchased', delta: -fromPurchased, kind: 'spend', reason, agent_run_id: agentRunId ?? null });
  const { error } = await sb.from('credit_ledger').insert(rows);
  if (error) return { ok: false, balance: bal };
  return { ok: true, balance: { granted: bal.granted - fromGranted, purchased: bal.purchased - fromPurchased, total: bal.total - amount } };
}

export async function grantCredits(
  sb: SupabaseClient,
  orgId: string,
  amount: number,
  reason: string,
): Promise<void> {
  await sb.from('credit_ledger').insert({ organization_id: orgId, pool: 'granted', delta: amount, kind: 'grant', reason });
}

export async function addPurchasedCredits(
  sb: SupabaseClient,
  orgId: string,
  amount: number,
  stripeRef: string,
): Promise<void> {
  // Idempotent on the Stripe reference — webhooks retry.
  const { data: dup } = await sb
    .from('credit_ledger')
    .select('id')
    .eq('organization_id', orgId)
    .eq('reason', stripeRef)
    .maybeSingle();
  if (dup) return;
  await sb.from('credit_ledger').insert({ organization_id: orgId, pool: 'purchased', delta: amount, kind: 'purchase', reason: stripeRef });
}

/**
 * Monthly allowance for orgs with metadata.monthlyCreditGrant (e.g. FMVN's
 * flagship 200/mo, capped via metadata.monthlyCreditCap on the GRANTED pool
 * balance). Called from the monthly cron. Returns credits actually granted.
 */
export async function applyMonthlyGrant(
  sb: SupabaseClient,
  org: { id: string; metadata: any },
): Promise<number> {
  const grant = Number(org.metadata?.monthlyCreditGrant ?? 0);
  if (!grant) return 0;
  const cap = Number(org.metadata?.monthlyCreditCap ?? grant);
  const bal = await getCreditBalance(sb, org.id);
  const room = Math.max(0, cap - bal.granted);
  const amount = Math.min(grant, room);
  if (amount > 0) await grantCredits(sb, org.id, amount, 'monthly_grant');
  return amount;
}

/** Plan-included monthly allowance (plans.included_credits_monthly) for orgs
 *  with a live subscription. Same cap discipline as applyMonthlyGrant: this
 *  path tops the granted pool up to one month's allowance — no accumulation,
 *  and a double-fire in the same month grants nothing extra. */
export async function applyPlanAllowance(
  sb: SupabaseClient,
  orgId: string,
  included: number,
): Promise<number> {
  if (!included) return 0;
  const bal = await getCreditBalance(sb, orgId);
  const room = Math.max(0, included - bal.granted);
  if (room > 0) await grantCredits(sb, orgId, room, 'plan_allowance');
  return room;
}

/** Credit packs (approved): list price $1/cr with volume bonuses. */
export const CREDIT_PACKS: Record<string, { credits: number; usd: number; label: string }> = {
  starter: { credits: 250, usd: 250, label: 'Starter · 250 credits' },
  standard: { credits: 1150, usd: 1000, label: 'Standard · 1,150 credits (~13% bonus)' },
  large: { credits: 3900, usd: 3000, label: 'Large · 3,900 credits (~30% bonus)' },
};
