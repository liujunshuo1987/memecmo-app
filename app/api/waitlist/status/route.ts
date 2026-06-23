/**
 * GET /api/waitlist/status?email=foo@bar.com
 *
 * Public-callable status lookup. Anyone with the email can check the position.
 * Backing function `get_waitlist_status` is SECURITY DEFINER and granted to anon.
 *
 * Rate-limited per IP (30/min) to deter scraping.
 * Returns null fields if the email isn't on the waitlist.
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRateLimit } from '@/lib/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_LIMIT = { scope: 'waitlist-status', limit: 30, windowMs: 60_000 };

export async function GET(req: NextRequest) {
  const blocked = await requireRateLimit(req, RATE_LIMIT);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const emailRaw = searchParams.get('email');
  const email = emailRaw?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {},
        remove() {},
      },
    },
  );

  const { data, error } = await supabase.rpc('get_waitlist_status', { p_email: email });
  if (error) {
    return Response.json({ error: 'status_lookup_failed', detail: error.message }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.status === null) {
    return Response.json({
      found: false,
      email,
      status: null,
      queue_position: null,
      total_pending: row?.total_pending ?? 0,
    });
  }

  return Response.json({
    found: true,
    email,
    status: row.status,
    queue_position: row.queue_position,
    total_pending: row.total_pending,
    joined_at: row.joined_at,
    approved_at: row.approved_at,
  });
}
