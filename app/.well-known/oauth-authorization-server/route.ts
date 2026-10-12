// RFC 8414 — authorization server metadata for the MemeCMO Connector.
import { authorizationServerMetadata, oauthJson, CORS_HEADERS } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return oauthJson(authorizationServerMetadata(), 200, { 'Cache-Control': 'public, max-age=3600' });
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
