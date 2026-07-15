#!/usr/bin/env node
// One-shot (idempotent) Stripe catalog bootstrap.
//
//   1. Put a REAL secret key in .env.local:  STRIPE_SECRET_KEY=sk_live_… (or sk_test_…)
//   2. node scripts/stripe-bootstrap.mjs
//
// For each row in plans: ensures a Product + a monthly USD Price matching
// price_usd_month, and writes the ids back. Re-run after changing a price —
// it creates a new Price, points the plan at it, and deactivates the old one.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV = join(REPO, '.env.local');
if (existsSync(ENV)) {
  for (const raw of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = raw.trim().match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const sk = process.env.STRIPE_SECRET_KEY || '';
if (!sk.startsWith('sk_') || sk.length < 20) {
  console.error('❌ STRIPE_SECRET_KEY missing or placeholder. Paste a real key into .env.local first.');
  process.exit(1);
}
const stripe = new Stripe(sk);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: plans, error } = await sb.from('plans').select('*').order('sort');
if (error) { console.error('❌ plans read:', error.message); process.exit(1); }

for (const plan of plans) {
  if (!plan.price_usd_month) { console.log(`⊘ ${plan.id}: no price set — skipped`); continue; }
  const cents = Math.round(Number(plan.price_usd_month) * 100);

  // Product
  let productId = plan.stripe_product_id;
  if (productId) {
    try { await stripe.products.retrieve(productId); }
    catch { productId = null; }
  }
  if (!productId) {
    const product = await stripe.products.create({
      name: `MemeCMO GEO — ${plan.name}`,
      description: `${plan.monthly_scan_quota} GEO scans / month · up to ${plan.max_projects} projects`,
      metadata: { planId: plan.id },
    });
    productId = product.id;
    console.log(`+ product ${plan.id} → ${productId}`);
  }

  // Price (monthly USD). Reuse when amount matches; otherwise rotate.
  let priceId = plan.stripe_price_id;
  let priceOk = false;
  if (priceId) {
    try {
      const p = await stripe.prices.retrieve(priceId);
      priceOk = p.active && p.unit_amount === cents && p.recurring?.interval === 'month' && p.currency === 'usd';
      if (!priceOk) { await stripe.prices.update(priceId, { active: false }); console.log(`~ ${plan.id}: old price deactivated`); }
    } catch { /* create anew */ }
  }
  if (!priceOk) {
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: cents,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { planId: plan.id },
    });
    priceId = price.id;
    console.log(`+ price ${plan.id} → ${priceId} ($${plan.price_usd_month}/mo)`);
  }

  await sb.from('plans').update({ stripe_product_id: productId, stripe_price_id: priceId }).eq('id', plan.id);
  console.log(`✓ ${plan.id}: $${plan.price_usd_month}/mo wired`);
}

console.log(`
NEXT (once):
  1. Stripe Dashboard → Developers → Webhooks → Add endpoint
       URL:    https://app.memecmo.ai/api/webhooks/stripe
       Events: checkout.session.completed, customer.subscription.updated,
               customer.subscription.deleted, invoice.payment_failed
  2. Copy the signing secret → STRIPE_WEBHOOK_SECRET in .env.local AND Vercel env.
  3. Add STRIPE_SECRET_KEY to Vercel env (Production) and redeploy.
`);
