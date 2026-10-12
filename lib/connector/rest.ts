// REST face of the connector (/api/connector/v1/*) — the same credentials,
// scope and data layer as the MCP server, for clients that speak plain HTTP:
// Zapier / Make triggers and actions, scripts, and the "public API".
//
// Every response is JSON. Successful bodies carry the attribution envelope;
// errors are { error, message }. 401 carries the same OAuth challenge as /api/mcp.

import { rateLimit } from '@/lib/api-guard';
import { verifyBearer, logConnectorEvent, type ConnectorPrincipal } from '@/lib/connector/auth';
import { CORS_HEADERS, ISSUER } from '@/lib/oauth/server';

export const DOCS_URL = 'https://app.memecmo.ai/connector';

const headers = (extra: Record<string, string> = {}) => ({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS, ...extra });

export const jsonOk = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: headers() });
export const jsonErr = (status: number, error: string, message: string, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify({ error, message }), { status, headers: headers(extra) });
export const optionsResponse = (): Response => new Response(null, { status: 204, headers: CORS_HEADERS });

/** Authenticate + rate-limit a REST call. Returns the principal, or the error response to send. */
export async function connectorAuth(req: Request, opts: { write?: boolean } = {}): Promise<{ principal: ConnectorPrincipal } | { response: Response }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const principal = token ? await verifyBearer(token) : null;
  if (!principal) {
    return { response: jsonErr(401, 'unauthorized', `Sign in through OAuth or send a MemeCMO connector key as "Authorization: Bearer mc_…". Docs: ${DOCS_URL}`, {
      'WWW-Authenticate': `Bearer realm="MemeCMO Connector", resource_metadata="${ISSUER}/.well-known/oauth-protected-resource", error="invalid_token"`,
    }) };
  }
  if (opts.write && !principal.scopes.includes('write')) {
    return { response: jsonErr(403, 'forbidden', 'This credential is read-only; logging actions needs the write scope (editor or admin).') };
  }
  const rl = await rateLimit(`mcp:${principal.keyId ?? principal.tokenId}`, { scope: 'mcp', limit: 120, windowMs: 60_000 });
  if (!rl.allowed) return { response: jsonErr(429, 'rate_limited', `Too many requests; retry in ${Math.ceil(rl.resetMs / 1000)}s.`, { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) }) };
  return { principal };
}

/** Run a tool-like handler with timing + usage log; exceptions become 400s. */
export async function runRest(principal: ConnectorPrincipal, tool: string, projectId: string | null, fn: () => Promise<unknown>): Promise<Response> {
  const t0 = Date.now();
  try {
    const out = await fn();
    logConnectorEvent({ principal, projectId, tool, ok: true, ms: Date.now() - t0 });
    return jsonOk(out);
  } catch (e) {
    logConnectorEvent({ principal, projectId, tool, ok: false, ms: Date.now() - t0 });
    const msg = e instanceof Error ? e.message : String(e);
    return jsonErr(msg.startsWith('Project ') ? 404 : 400, 'bad_request', msg);
  }
}
