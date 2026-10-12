// OAuth 2.1 token endpoint: authorization_code (PKCE) and refresh_token.
import type { NextRequest } from 'next/server';
import { requireRateLimit } from '@/lib/api-guard';
import { authenticateClient, exchangeCode, refreshTokens, readTokenRequest, oauthJson, oauthErrorResponse, OAuthError, CORS_HEADERS } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = await requireRateLimit(req, { scope: 'oauth-token', limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const b = await readTokenRequest(req);
    if (!b.client_id) throw new OAuthError('invalid_client', 'client_id is required', 401);
    const client = await authenticateClient(b.client_id, b.client_secret ?? null);
    if (b.grant_type === 'authorization_code') {
      return oauthJson(await exchangeCode(client, b.code ?? '', b.redirect_uri ?? null, b.code_verifier ?? '', b.resource ?? null));
    }
    if (b.grant_type === 'refresh_token') {
      return oauthJson(await refreshTokens(client, b.refresh_token ?? '', b.scope ?? null));
    }
    throw new OAuthError('unsupported_grant_type', 'use authorization_code or refresh_token');
  } catch (e) {
    return oauthErrorResponse(e);
  }
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
