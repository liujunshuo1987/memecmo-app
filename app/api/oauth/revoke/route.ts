// RFC 7009 — token revocation (access or refresh token; always answers 200).
import type { NextRequest } from 'next/server';
import { authenticateClient, revokeToken, readTokenRequest, oauthJson, oauthErrorResponse, OAuthError, CORS_HEADERS } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const b = await readTokenRequest(req);
    if (!b.client_id) throw new OAuthError('invalid_client', 'client_id is required', 401);
    const client = await authenticateClient(b.client_id, b.client_secret ?? null);
    await revokeToken(client, b.token ?? '');
    return oauthJson({ ok: true });
  } catch (e) {
    return oauthErrorResponse(e);
  }
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
