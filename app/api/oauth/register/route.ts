// RFC 7591 — dynamic client registration (open, rate-limited by IP).
import type { NextRequest } from 'next/server';
import { requireRateLimit } from '@/lib/api-guard';
import { registerClient, oauthJson, oauthErrorResponse, CORS_HEADERS } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = await requireRateLimit(req, { scope: 'oauth-register', limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return oauthJson({ error: 'invalid_client_metadata', error_description: 'body must be JSON' }, 400); }
  try {
    return oauthJson(await registerClient(body ?? {}), 201);
  } catch (e) {
    return oauthErrorResponse(e);
  }
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
