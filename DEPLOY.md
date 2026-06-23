# Deploying MemeCMO.ai app

End-to-end checklist for getting `app.memecmo.ai` live on Vercel + Supabase + Stripe + Resend + Upstash + Poe.

## Prereqs

- GitHub account (already have: liujunshuo1987)
- Vercel account
- Supabase account
- Stripe account (or new product on existing)
- Resend account (already set up for memecmo.ai static site — can reuse key)
- Upstash account
- Poe.com API key (already have it from guanlan)
- `psql` installed locally for one-shot migration runs:
  `brew install libpq && brew link --force libpq`

## 1. Push this repo to GitHub

```bash
cd /Users/sx/Downloads/09_GEO企业出海/memecmo-app
gh repo create liujunshuo1987/memecmo-app --public --source=. --remote=origin --push
# Or, if not using gh CLI:
# 1) Create empty repo at https://github.com/new (name: memecmo-app)
# 2) git remote add origin git@github.com:liujunshuo1987/memecmo-app.git
# 3) git push -u origin main
```

## 2. Create new Supabase project

1. https://supabase.com/dashboard → New project
2. Name: `memecmo-prod`
3. Region: `Northeast Asia (Tokyo)` — closest to SE Asia clients
4. Save the database password — you'll need it once
5. Wait for the project to be provisioned (~2 min)

### Get connection details

- Project Settings → API:
  - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
  - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (treat as secret)
- Project Settings → Database → Connection string → **URI** (use the "Transaction pooler" URI) → `DATABASE_URL`

### Run migrations

```bash
cp .env.local.example .env.local
# edit .env.local — at minimum, set DATABASE_URL
./scripts/run-migrations.sh
```

Expect to see ✓ for each of the 12 migrations.

## 3. Create Stripe products

In your Stripe dashboard (use test mode first, then live):

1. Create a Product called "MemeCMO.ai Pro" with monthly recurring price (your call: $99/mo? $199/mo?)
2. Create a Product called "MemeCMO.ai Distributor" for FMVN/channel partner pricing
3. Note both Price IDs (`price_…`) — you'll wire them into the pricing page code separately

Get:
- **Secret key** → `STRIPE_SECRET_KEY`
- **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (optional)

Webhook (set up after deploy — needs the live URL):
- Stripe dashboard → Webhooks → Add endpoint
- URL: `https://app.memecmo.ai/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- → Signing secret → `STRIPE_WEBHOOK_SECRET`

## 4. Upstash Redis

1. https://console.upstash.com → Create Database
2. Name: `memecmo-prod-ratelimit`
3. Region: closest to Vercel (auto-pick is fine)
4. Type: Regional (free tier is enough)
5. Save:
   - **REST URL** → `UPSTASH_REDIS_REST_URL`
   - **REST Token** → `UPSTASH_REDIS_REST_TOKEN`

## 5. Resend — reuse existing key

Use the same `RESEND_API_KEY` you set for `memecmo-site`. If you've verified `memecmo.ai` as a sending domain, this works.

## 6. Deploy to Vercel

1. https://vercel.com → New Project → Import `liujunshuo1987/memecmo-app`
2. Framework: **Next.js** (auto-detected)
3. Build command, output dir: leave default
4. **Environment Variables**: copy every key from `.env.local.example`, paste real values. Mark `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `POE_API_KEY`, `RESEND_API_KEY`, `UPSTASH_REDIS_REST_TOKEN` as **secret**.
5. Deploy.

## 7. DNS — add app.memecmo.ai

In your Netlify DNS panel (where memecmo.ai is hosted):

| Name | Type | Value |
|---|---|---|
| `app` | CNAME | `cname.vercel-dns.com.` (or the project-specific value Vercel shows) |

Then in Vercel project → Settings → Domains → add `app.memecmo.ai` → wait for DNS to propagate (5-15 min) → SSL auto-issued.

## 8. Verification

After domain goes green in Vercel:

```bash
# Should return 200
curl -sI https://app.memecmo.ai/ | head -3

# Should redirect to login (auth required)
curl -sI https://app.memecmo.ai/dashboard | head -5

# JSON-LD should mention MemeCMO.ai with NeuronSpark Media-Tech as legal entity
curl -s https://app.memecmo.ai/ | grep -A5 'application/ld+json' | head -20
```

Then in browser, sign up (waitlist or direct depending on what you've enabled), try the SEA Command Center, run a 3-agent orchestration for "Vietnam" — confirm the Poe API works and the SSE stream shows live agent telemetry.

## Maintenance

To add new migrations later:
1. Drop the new SQL file into `supabase/migrations/` with a date-prefixed name
2. Re-run `./scripts/run-migrations.sh`
3. The `__migrations` tracking table skips already-applied files

To rotate the Resend API key, Stripe key, etc:
1. Update in Vercel project → Settings → Environment Variables
2. Redeploy from Vercel UI (env changes only apply at deploy time)
