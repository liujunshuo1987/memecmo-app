/**
 * POST /api/waitlist/join
 *
 * Anonymous-allowed endpoint to join the Tier 0 waitlist.
 * Pre-signup gate (see docs/GUANLAN_AGENT_LIBRARY.md, waitlist migration).
 *
 * - Rate-limited per IP (3 joins / hour / IP) to deter spam
 * - Inserts via anon Supabase client; RLS policy on waitlist table enforces
 *   that the caller cannot set status/approval/token columns
 * - On duplicate email: returns 200 with current status (idempotent), not an error
 * - Returns queue_position + total_pending so the success UI can show "you're #N"
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { requireRateLimit, callerIP } from '@/lib/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_LIMIT = { scope: 'waitlist-join', limit: 3, windowMs: 60 * 60_000 };

interface JoinBody {
  email?: string;
  brand_or_company?: string;
  brand_of_interest?: string;
  role?: string;
  target_market?: 'overseas' | 'china' | 'global' | 'other';
  geo_challenge?: string;
  source?: string;
  referrer_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

function hashIP(ip: string): string {
  const salt = process.env.WAITLIST_IP_HASH_SALT || 'guanlan-dev-salt';
  return createHash('sha256').update(ip + salt).digest('hex').slice(0, 32);
}

function clampString(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function POST(req: NextRequest) {
  // 1. Rate limit by IP
  const blocked = await requireRateLimit(req, RATE_LIMIT);
  if (blocked) return blocked;

  // 2. Parse body
  let body: JoinBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  // 3. Validate required fields
  const email = clampString(body.email?.toLowerCase(), 254);
  const brand_or_company = clampString(body.brand_or_company, 200);
  const brand_of_interest = clampString(body.brand_of_interest, 200);

  if (!email || !validateEmail(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (!brand_or_company) {
    return Response.json({ error: 'brand_or_company_required' }, { status: 400 });
  }
  if (!brand_of_interest) {
    return Response.json({ error: 'brand_of_interest_required' }, { status: 400 });
  }

  // 4. Sanitize optional fields
  const role = clampString(body.role, 100);
  const geo_challenge = clampString(body.geo_challenge, 1000);
  const target_market = ['overseas', 'china', 'global', 'other'].includes(body.target_market || '')
    ? body.target_market : null;

  // 5. Tracking metadata
  const ip = callerIP(req);
  const ip_hash = ip === 'unknown' ? null : hashIP(ip);
  const user_agent_excerpt = clampString(req.headers.get('user-agent'), 200);
  const source = clampString(body.source, 50);
  const referrer_url = clampString(body.referrer_url, 500);
  const utm_source = clampString(body.utm_source, 100);
  const utm_medium = clampString(body.utm_medium, 100);
  const utm_campaign = clampString(body.utm_campaign, 100);

  // 6. Insert via anon Supabase client. RLS enforces the safe-column whitelist.
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() { /* no-op for this anon endpoint */ },
        remove() { /* no-op */ },
      },
    },
  );

  const { error: insertErr } = await supabase.from('waitlist').insert({
    email,
    brand_or_company,
    brand_of_interest,
    role,
    target_market,
    geo_challenge,
    source,
    referrer_url,
    utm_source,
    utm_medium,
    utm_campaign,
    ip_hash,
    user_agent_excerpt,
  });

  // Duplicate email — gracefully return current status instead of erroring
  if (insertErr) {
    const isDuplicate = insertErr.code === '23505' || /duplicate|unique/i.test(insertErr.message);
    if (!isDuplicate) {
      return Response.json({ error: 'insert_failed', detail: insertErr.message }, { status: 500 });
    }
    // fall through to status lookup
  }

  // 7. Look up position via security-definer function
  const { data: statusData, error: statusErr } = await supabase
    .rpc('get_waitlist_status', { p_email: email });

  if (statusErr) {
    return Response.json({ error: 'status_lookup_failed', detail: statusErr.message }, { status: 500 });
  }

  const row = Array.isArray(statusData) ? statusData[0] : statusData;
  return Response.json({
    ok: true,
    already_on_list: !!insertErr,
    email,
    status: row?.status ?? 'pending',
    queue_position: row?.queue_position ?? null,
    total_pending: row?.total_pending ?? null,
    joined_at: row?.joined_at ?? null,
  });
}
