// RFC 9728 — protected resource metadata for /api/mcp. Served at the root
// path and at the path-aware location (/.well-known/oauth-protected-resource/api/mcp),
// because clients of different spec vintages look in either place.
import { protectedResourceMetadata, oauthJson, CORS_HEADERS } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return oauthJson(protectedResourceMetadata(), 200, { 'Cache-Control': 'public, max-age=3600' });
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
