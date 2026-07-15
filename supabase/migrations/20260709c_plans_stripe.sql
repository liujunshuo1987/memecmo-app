-- ③ Commercial: attach Stripe identifiers to plans. Prices default to the
-- Schema署名清單 §2.5 suggested tiers (299/999/2999 USD/mo) — change
-- plans.price_usd_month and rerun scripts/stripe-bootstrap.mjs to reprice.
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_price_id   TEXT;

UPDATE public.plans SET price_usd_month = 299  WHERE id = 'basic'    AND price_usd_month IS NULL;
UPDATE public.plans SET price_usd_month = 999  WHERE id = 'standard' AND price_usd_month IS NULL;
UPDATE public.plans SET price_usd_month = 2999 WHERE id = 'premium'  AND price_usd_month IS NULL;
