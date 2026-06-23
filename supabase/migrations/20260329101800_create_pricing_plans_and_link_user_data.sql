/*
  # Pricing Plans Table & User Data Linking

  1. New Tables
    - `pricing_plans` - Stores the two-dimensional pricing matrix
      - `id` (uuid, primary key)
      - `plan_type` (text, e.g. free/professional/enterprise)
      - `billing_cycle` (text, monthly/yearly)
      - `price_usd` (numeric, price in USD)
      - `price_hkd` (numeric, price in HKD)
      - `stripe_price_id` (text, Stripe Price ID reference)
      - `features` (jsonb, list of included features)
      - `quota_config` (jsonb, default quota limits for this plan)
      - `display_order` (integer, for sorting on pricing page)
      - `is_active` (boolean, whether this plan is currently available)
      - `created_at` (timestamptz)

  2. Modified Tables
    - `brands` - Add `user_id` column linking brands to authenticated users
    - `scan_submissions` - Add `user_id` column linking scans to users

  3. Seed Data
    - Insert Free, Professional, and Enterprise pricing plans for monthly and yearly cycles

  4. Security
    - Enable RLS on `pricing_plans`
    - Public can read active pricing plans (needed for pricing page)
    - Only service role can modify pricing plans
*/

-- Create pricing_plans table
CREATE TABLE IF NOT EXISTS pricing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_type text NOT NULL CHECK (plan_type IN ('free', 'professional', 'enterprise', 'custom')),
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly', 'lifetime')),
  price_usd numeric(10,2) NOT NULL DEFAULT 0,
  price_hkd numeric(10,2) NOT NULL DEFAULT 0,
  stripe_price_id text,
  features jsonb DEFAULT '[]'::jsonb,
  quota_config jsonb DEFAULT '{}'::jsonb,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(plan_type, billing_cycle)
);

ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active pricing plans"
  ON pricing_plans FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Add user_id to brands if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE brands ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_brands_user_id ON brands(user_id);
  END IF;
END $$;

-- Add user_id to scan_submissions if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_submissions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE scan_submissions ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_scan_submissions_user_id ON scan_submissions(user_id);
  END IF;
END $$;

-- Seed pricing plans data
INSERT INTO pricing_plans (plan_type, billing_cycle, price_usd, price_hkd, features, quota_config, display_order) VALUES
(
  'free', 'monthly', 0, 0,
  '["1 brand monitoring", "5 AI visibility scans/month", "3 GEO audits/month", "1 competitor tracking", "Basic results view"]'::jsonb,
  '{"brands_limit": 1, "scans_limit": 5, "audits_limit": 3, "competitors_limit": 1, "api_calls_limit": 0}'::jsonb,
  1
),
(
  'free', 'yearly', 0, 0,
  '["1 brand monitoring", "5 AI visibility scans/month", "3 GEO audits/month", "1 competitor tracking", "Basic results view"]'::jsonb,
  '{"brands_limit": 1, "scans_limit": 5, "audits_limit": 3, "competitors_limit": 1, "api_calls_limit": 0}'::jsonb,
  1
),
(
  'professional', 'monthly', 99, 780,
  '["5 brands monitoring", "50 AI visibility scans/month", "20 GEO audits/month", "5 competitors per brand", "API access", "Full reports with PDF export", "Email alerts", "Priority support"]'::jsonb,
  '{"brands_limit": 5, "scans_limit": 50, "audits_limit": 20, "competitors_limit": 5, "api_calls_limit": 500}'::jsonb,
  2
),
(
  'professional', 'yearly', 79, 620,
  '["5 brands monitoring", "50 AI visibility scans/month", "20 GEO audits/month", "5 competitors per brand", "API access", "Full reports with PDF export", "Email alerts", "Priority support"]'::jsonb,
  '{"brands_limit": 5, "scans_limit": 50, "audits_limit": 20, "competitors_limit": 5, "api_calls_limit": 500}'::jsonb,
  2
),
(
  'enterprise', 'monthly', 299, 2340,
  '["Unlimited brands", "Unlimited AI visibility scans", "Unlimited GEO audits", "Unlimited competitors", "Full API access", "Team collaboration (10 members)", "Custom integrations", "Dedicated account manager", "SLA guarantee", "White-label reports"]'::jsonb,
  '{"brands_limit": 9999, "scans_limit": 9999, "audits_limit": 9999, "competitors_limit": 9999, "api_calls_limit": 9999}'::jsonb,
  3
),
(
  'enterprise', 'yearly', 239, 1870,
  '["Unlimited brands", "Unlimited AI visibility scans", "Unlimited GEO audits", "Unlimited competitors", "Full API access", "Team collaboration (10 members)", "Custom integrations", "Dedicated account manager", "SLA guarantee", "White-label reports"]'::jsonb,
  '{"brands_limit": 9999, "scans_limit": 9999, "audits_limit": 9999, "competitors_limit": 9999, "api_calls_limit": 9999}'::jsonb,
  3
)
ON CONFLICT (plan_type, billing_cycle) DO NOTHING;
