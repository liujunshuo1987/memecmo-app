/**
 * API access guards — auth + rate limiting.
 *
 * Tiering (see docs/GEO_AEO_ALGORITHM_LOG.md, 2026-05-04 entry):
 *   - PUBLIC tier:    requireRateLimit() — anonymous-allowed, IP throttled.
 *                     For light HTML-fetch endpoints (brand-audit, regional-audit).
 *   - PROTECTED tier: requireAuth() + requireRateLimit() — must be logged in,
 *                     and per-user-id throttled. For high-cost LLM endpoints
 *                     (sea-orchestrator, brand-probes, multi-model-query).
 *
 * Rate-limit backend:
 *   - Production: Upstash Redis sliding-window via @upstash/ratelimit.
 *     Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to activate.
 *     Globally consistent across Vercel lambda instances.
 *   - Dev / unconfigured: falls back to in-process Map (per-lambda only).
 *     Logged once at module load so the gap is visible.
 */

import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createClient } from '@/lib/supabase/server';

// ─── Backend selection ────────────────────────────────────────────────────
// Accept both naming conventions:
//   - UPSTASH_REDIS_REST_URL/TOKEN (Upstash native)
//   - KV_REST_API_URL/TOKEN (Vercel Marketplace integration provisions these)
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const UPSTASH_ENABLED = !!(UPSTASH_URL && UPSTASH_TOKEN);

let upstashRedis: Redis | null = null;
if (UPSTASH_ENABLED) {
  upstashRedis = new Redis({ url: UPSTASH_URL!, token: UPSTASH_TOKEN! });
} else if (process.env.NODE_ENV === 'production') {
  // Loud warning in prod — limiter is degraded
  // eslint-disable-next-line no-console
  console.warn(
    '[api-guard] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiter falling back to in-memory (per-lambda only). ' +
      'See docs/GEO_AEO_ALGORITHM_LOG.md',
  );
}

// One Ratelimit instance per (scope, limit, windowMs) tuple — keep cached.
const ratelimitCache = new Map<string, Ratelimit>();
function getUpstashLimiter(opts: RateLimitOptions): Ratelimit {
  const cacheKey = `${opts.scope}|${opts.limit}|${opts.windowMs}`;
  let r = ratelimitCache.get(cacheKey);
  if (!r) {
    r = new Ratelimit({
      redis: upstashRedis!,
      limiter: Ratelimit.slidingWindow(opts.limit, `${Math.ceil(opts.windowMs / 1000)} s`),
      prefix: `rl:${opts.scope}`,
      analytics: false,
    });
    ratelimitCache.set(cacheKey, r);
  }
  return r;
}

// ─── In-memory fallback (per-lambda) ──────────────────────────────────────
type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.hits.length === 0 || b.hits[b.hits.length - 1] < now - 3_600_000) {
      buckets.delete(k);
    }
  }
}

function inMemoryRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const bucketKey = `${opts.scope}::${key}`;
  const cutoff = now - opts.windowMs;
  let b = buckets.get(bucketKey);
  if (!b) { b = { hits: [] }; buckets.set(bucketKey, b); }
  while (b.hits.length && b.hits[0] < cutoff) b.hits.shift();
  if (b.hits.length >= opts.limit) {
    const oldest = b.hits[0];
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(0, oldest + opts.windowMs - now),
      key: bucketKey,
      backend: 'memory',
    };
  }
  b.hits.push(now);
  return {
    allowed: true,
    remaining: opts.limit - b.hits.length,
    resetMs: opts.windowMs,
    key: bucketKey,
    backend: 'memory',
  };
}

// ─── Types ────────────────────────────────────────────────────────────────
export interface RateLimitOptions {
  /** Bucket scope — keeps unrelated routes from sharing budget */
  scope: string;
  /** Max hits per window */
  limit: number;
  /** Window in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  key: string;
  backend: 'upstash' | 'memory';
}

/** Best-effort caller IP. Vercel/Cloudflare set common headers. */
export function callerIP(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  return 'unknown';
}

/** Throttle by an arbitrary key. Async because Upstash is over-the-wire. */
export async function rateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  if (UPSTASH_ENABLED && upstashRedis) {
    try {
      const limiter = getUpstashLimiter(opts);
      const fullKey = `${opts.scope}::${key}`;
      const r = await limiter.limit(fullKey);
      return {
        allowed: r.success,
        remaining: r.remaining,
        resetMs: Math.max(0, r.reset - Date.now()),
        key: fullKey,
        backend: 'upstash',
      };
    } catch (err) {
      // If Upstash is down, fail-open to memory rather than 500ing the route
      // eslint-disable-next-line no-console
      console.warn('[api-guard] Upstash limiter error, falling back to memory:', (err as Error).message);
      return inMemoryRateLimit(key, opts);
    }
  }
  return inMemoryRateLimit(key, opts);
}

/** Convenience: returns a Response if blocked, null if allowed. */
export async function requireRateLimit(
  req: NextRequest,
  opts: RateLimitOptions,
  keyOverride?: string,
): Promise<Response | null> {
  const key = keyOverride ?? callerIP(req);
  const res = await rateLimit(key, opts);
  if (res.allowed) return null;
  return Response.json(
    {
      error: 'rate_limited',
      message: `Too many requests. Try again in ${Math.ceil(res.resetMs / 1000)}s.`,
      retryAfterSeconds: Math.ceil(res.resetMs / 1000),
      backend: res.backend,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil(res.resetMs / 1000)),
        'X-RateLimit-Limit': String(opts.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Backend': res.backend,
      },
    },
  );
}

// ─── Supabase auth gate ───────────────────────────────────────────────────
export interface AuthedUser {
  id: string;
  email: string | null;
}

export async function requireAuth(): Promise<{ user: AuthedUser } | { response: Response }> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return {
      response: Response.json(
        {
          error: 'unauthorized',
          message: 'This endpoint requires sign-in. POE-backed deep probes are paywalled.',
        },
        { status: 401 },
      ),
    };
  }
  return { user: { id: data.user.id, email: data.user.email ?? null } };
}

/** Combined: auth + per-user rate limit. */
export async function requireAuthAndRateLimit(
  req: NextRequest,
  opts: RateLimitOptions,
): Promise<{ user: AuthedUser } | { response: Response }> {
  const auth = await requireAuth();
  if ('response' in auth) return auth;
  const blocked = await requireRateLimit(req, opts, `uid:${auth.user.id}`);
  if (blocked) return { response: blocked };
  return auth;
}

/** Diagnostic: which backend is active. Useful for the verify script. */
export function rateLimitBackend(): 'upstash' | 'memory' {
  return UPSTASH_ENABLED ? 'upstash' : 'memory';
}
