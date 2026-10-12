// OAuth 2.1 authorization server for the MemeCMO Connector.
//
// Issuer = the app origin. The MCP server at /api/mcp is the protected
// resource. Flows: authorization code + PKCE (S256, mandatory), refresh token
// rotation, dynamic client registration (RFC 7591) and Client ID Metadata
// Documents (client_id = https URL of a JSON document). Tokens are opaque and
// stored hashed; a token is bound to ONE organization chosen at consent.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { serviceClient } from '@/lib/commerce';

export const ISSUER = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.memecmo.ai').replace(/\/+$/, '');
export const RESOURCE = `${ISSUER}/api/mcp`;
export const SCOPES = ['read', 'write'] as const;
export const SCOPE_TEXT: Record<string, { zh: string; en: string }> = {
  read: { zh: '读取评分卡、缺口、信源、交付物与行动台账', en: 'Read scorecards, gaps, sources, deliverables and the action ledger' },
  write: { zh: '登记已发布的行动(log_action)', en: 'Log published actions (log_action)' },
};

const ACCESS_TTL_S = 24 * 3600;
const REFRESH_TTL_S = 60 * 24 * 3600;
const CODE_TTL_S = 10 * 60;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const rand = (prefix: string, bytes = 32) => `${prefix}${randomBytes(bytes).toString('base64url')}`;
const b64urlSha256 = (s: string) => createHash('sha256').update(s).digest('base64url');

export class OAuthError extends Error {
  constructor(public code: string, description: string, public status = 400) { super(description); }
}

// ── metadata ────────────────────────────────────────────────────────────────
export function authorizationServerMetadata() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/api/oauth/token`,
    registration_endpoint: `${ISSUER}/api/oauth/register`,
    revocation_endpoint: `${ISSUER}/api/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [...SCOPES],
    service_documentation: `${ISSUER}/connector`,
    client_id_metadata_document_supported: true,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: RESOURCE,
    authorization_servers: [ISSUER],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'MemeCMO Connector',
    resource_documentation: `${ISSUER}/connector`,
  };
}

// ── clients ─────────────────────────────────────────────────────────────────
export interface OAuthClient {
  client_id: string; kind: 'dcr' | 'cimd'; client_name: string | null; client_uri: string | null;
  redirect_uris: string[]; token_endpoint_auth_method: string; client_secret_hash: string | null; last_seen_at: string | null;
}

function validRedirectUri(u: string): boolean {
  let url: URL;
  try { url = new URL(u); } catch { return false; }
  if (url.hash) return false;
  const p = url.protocol;
  if (p === 'javascript:' || p === 'data:' || p === 'file:') return false;
  if (p === 'http:') return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  return true; // https and native custom schemes (cursor://, vscode://, …)
}

/** Exact match, except loopback http where the port may vary (RFC 8252 §7.3). */
export function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  try {
    const r = new URL(requested);
    if (r.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(r.hostname)) return false;
    return registered.some((x) => { try { const u = new URL(x); return u.protocol === 'http:' && u.hostname === r.hostname && u.pathname === r.pathname; } catch { return false; } });
  } catch { return false; }
}

export async function registerClient(body: Record<string, unknown>) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (!uris.length || uris.length > 10) throw new OAuthError('invalid_redirect_uri', 'redirect_uris must list 1–10 URIs');
  for (const u of uris) if (!validRedirectUri(u)) throw new OAuthError('invalid_redirect_uri', `redirect_uri not allowed: ${u}`);
  const method = typeof body.token_endpoint_auth_method === 'string' ? body.token_endpoint_auth_method : 'none';
  if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) throw new OAuthError('invalid_client_metadata', 'unsupported token_endpoint_auth_method');
  const grants = Array.isArray(body.grant_types) ? body.grant_types : ['authorization_code', 'refresh_token'];
  if (!grants.includes('authorization_code')) throw new OAuthError('invalid_client_metadata', 'grant_types must include authorization_code');
  const name = typeof body.client_name === 'string' ? body.client_name.slice(0, 120) : null;
  const clientUri = typeof body.client_uri === 'string' ? body.client_uri.slice(0, 300) : null;
  const clientId = rand('mcc_', 16);
  const secret = method === 'none' ? null : rand('mcs_', 32);
  const sb = serviceClient();
  const { error } = await sb.from('oauth_clients').insert({
    client_id: clientId, kind: 'dcr', client_name: name, client_uri: clientUri, redirect_uris: uris,
    token_endpoint_auth_method: method, client_secret_hash: secret ? sha256(secret) : null,
    metadata: { grant_types: grants, response_types: ['code'], scope: body.scope ?? null, software_id: body.software_id ?? null, software_version: body.software_version ?? null, logo_uri: body.logo_uri ?? null },
  });
  if (error) throw new OAuthError('server_error', error.message, 500);
  return {
    client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_name: name ?? undefined, client_uri: clientUri ?? undefined, redirect_uris: uris,
    token_endpoint_auth_method: method, grant_types: grants, response_types: ['code'], scope: SCOPES.join(' '),
  };
}

/** A registered client, or a Client ID Metadata Document fetched (and cached) from the https client_id. */
export async function resolveClient(clientId: string): Promise<OAuthClient | null> {
  const sb = serviceClient();
  const { data } = await sb.from('oauth_clients').select('client_id, kind, client_name, client_uri, redirect_uris, token_endpoint_auth_method, client_secret_hash, last_seen_at').eq('client_id', clientId).maybeSingle();
  const fresh = data && data.last_seen_at && Date.now() - Date.parse(data.last_seen_at) < 24 * 3600e3;
  if (data && (data.kind === 'dcr' || fresh)) return data as OAuthClient;
  if (!/^https:\/\/[^\s]+$/.test(clientId) || clientId.length > 500) return (data as OAuthClient | null) ?? null;
  // CIMD: the client_id is a URL of a JSON document describing the client.
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(clientId, { headers: { Accept: 'application/json' }, signal: ctrl.signal, redirect: 'manual' });
    clearTimeout(t);
    if (!res.ok) return (data as OAuthClient | null) ?? null;
    const text = (await res.text()).slice(0, 50_000);
    const doc = JSON.parse(text) as Record<string, unknown>;
    if (doc.client_id !== clientId) return null;
    const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((u): u is string => typeof u === 'string' && validRedirectUri(u)) : [];
    if (!uris.length) return null;
    const row = {
      client_id: clientId, kind: 'cimd' as const, client_name: typeof doc.client_name === 'string' ? doc.client_name.slice(0, 120) : new URL(clientId).hostname,
      client_uri: typeof doc.client_uri === 'string' ? doc.client_uri.slice(0, 300) : null, redirect_uris: uris,
      token_endpoint_auth_method: 'none', client_secret_hash: null, metadata: doc, last_seen_at: new Date().toISOString(),
    };
    await sb.from('oauth_clients').upsert(row, { onConflict: 'client_id' });
    return { ...row, last_seen_at: row.last_seen_at };
  } catch {
    return (data as OAuthClient | null) ?? null;
  }
}

// ── authorize ───────────────────────────────────────────────────────────────
export interface AuthorizeRequest {
  client: OAuthClient; redirectUri: string; state: string | null; scopes: string[];
  codeChallenge: string; codeChallengeMethod: 'S256'; resource: string | null;
}

export function parseScopes(scope: string | null | undefined): string[] {
  const asked = (scope ?? '').split(/[\s+]+/).map((s) => s.trim()).filter(Boolean);
  const known = asked.filter((s) => (SCOPES as readonly string[]).includes(s));
  return known.length ? Array.from(new Set(known)) : [...SCOPES];
}

/** Validate the front-channel request. Errors before the redirect_uri is trusted are shown, never redirected. */
export async function validateAuthorizeRequest(q: URLSearchParams): Promise<AuthorizeRequest> {
  const clientId = q.get('client_id') || '';
  if (!clientId) throw new OAuthError('invalid_request', 'client_id is required');
  const client = await resolveClient(clientId);
  if (!client) throw new OAuthError('invalid_client', 'Unknown client. Register it first (dynamic registration) or use an https client_id with a metadata document.');
  const redirectUri = q.get('redirect_uri') || (client.redirect_uris.length === 1 ? client.redirect_uris[0] : '');
  if (!redirectUri || !redirectMatches(client.redirect_uris, redirectUri)) throw new OAuthError('invalid_request', 'redirect_uri is not registered for this client');
  if ((q.get('response_type') || 'code') !== 'code') throw new OAuthError('unsupported_response_type', 'only response_type=code is supported');
  const codeChallenge = q.get('code_challenge') || '';
  const method = q.get('code_challenge_method') || 'S256';
  if (!codeChallenge || method !== 'S256') throw new OAuthError('invalid_request', 'PKCE with code_challenge_method=S256 is required');
  const resource = q.get('resource');
  if (resource && resource.replace(/\/+$/, '') !== RESOURCE) throw new OAuthError('invalid_target', `resource must be ${RESOURCE}`);
  return { client, redirectUri, state: q.get('state'), scopes: parseScopes(q.get('scope')), codeChallenge, codeChallengeMethod: 'S256', resource: resource ?? null };
}

export async function issueCode(req: AuthorizeRequest, userId: string, organizationId: string, scopes: string[]): Promise<string> {
  const code = rand('mca_', 32);
  const sb = serviceClient();
  const { error } = await sb.from('oauth_codes').insert({
    code_hash: sha256(code), client_id: req.client.client_id, user_id: userId, organization_id: organizationId, scopes,
    redirect_uri: req.redirectUri, code_challenge: req.codeChallenge, code_challenge_method: 'S256', resource: req.resource,
    expires_at: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  });
  if (error) throw new OAuthError('server_error', error.message, 500);
  return code;
}

export function redirectWith(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

// ── token ───────────────────────────────────────────────────────────────────
function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Client authentication for the token / revocation endpoints. */
export async function authenticateClient(clientId: string, clientSecret: string | null): Promise<OAuthClient> {
  const client = await resolveClient(clientId);
  if (!client) throw new OAuthError('invalid_client', 'unknown client', 401);
  if (client.token_endpoint_auth_method !== 'none') {
    if (!clientSecret || !client.client_secret_hash || !safeEq(sha256(clientSecret), client.client_secret_hash)) throw new OAuthError('invalid_client', 'client authentication failed', 401);
  }
  return client;
}

export interface TokenResponse { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string }

async function mint(sb: ReturnType<typeof serviceClient>, row: { client_id: string; user_id: string; organization_id: string; scopes: string[]; resource: string | null }, existingId?: string): Promise<TokenResponse> {
  const access = rand('mco_', 32), refresh = rand('mcr_', 32);
  const now = Date.now();
  const patch = {
    token_hash: sha256(access), refresh_hash: sha256(refresh), client_id: row.client_id, user_id: row.user_id, organization_id: row.organization_id,
    scopes: row.scopes, resource: row.resource, expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TTL_S * 1000).toISOString(), revoked_at: null, last_used_at: null,
  };
  const { error } = existingId ? await sb.from('oauth_tokens').update(patch).eq('id', existingId) : await sb.from('oauth_tokens').insert(patch);
  if (error) throw new OAuthError('server_error', error.message, 500);
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: row.scopes.join(' ') };
}

export async function exchangeCode(client: OAuthClient, code: string, redirectUri: string | null, codeVerifier: string, resource: string | null): Promise<TokenResponse> {
  if (!code || !codeVerifier) throw new OAuthError('invalid_request', 'code and code_verifier are required');
  const sb = serviceClient();
  const { data: row } = await sb.from('oauth_codes').select('*').eq('code_hash', sha256(code)).maybeSingle();
  if (!row) throw new OAuthError('invalid_grant', 'unknown code');
  if (row.client_id !== client.client_id) throw new OAuthError('invalid_grant', 'code was issued to another client');
  if (row.used_at || Date.parse(row.expires_at) < Date.now()) throw new OAuthError('invalid_grant', 'code expired or already used');
  if (redirectUri && redirectUri !== row.redirect_uri) throw new OAuthError('invalid_grant', 'redirect_uri mismatch');
  if (!safeEq(b64urlSha256(codeVerifier), row.code_challenge)) throw new OAuthError('invalid_grant', 'PKCE verification failed');
  if (resource && resource.replace(/\/+$/, '') !== RESOURCE) throw new OAuthError('invalid_target', `resource must be ${RESOURCE}`);
  // Single use: only the first exchange sees used_at IS NULL.
  const { data: claimed } = await sb.from('oauth_codes').update({ used_at: new Date().toISOString() }).eq('code_hash', row.code_hash).is('used_at', null).select('code_hash');
  if (!claimed?.length) throw new OAuthError('invalid_grant', 'code already used');
  return mint(sb, { client_id: row.client_id, user_id: row.user_id, organization_id: row.organization_id, scopes: row.scopes, resource: row.resource });
}

export async function refreshTokens(client: OAuthClient, refreshToken: string, scope: string | null): Promise<TokenResponse> {
  if (!refreshToken) throw new OAuthError('invalid_request', 'refresh_token is required');
  const sb = serviceClient();
  const { data: row } = await sb.from('oauth_tokens').select('*').eq('refresh_hash', sha256(refreshToken)).maybeSingle();
  if (!row || row.revoked_at) throw new OAuthError('invalid_grant', 'unknown or revoked refresh token');
  if (row.client_id !== client.client_id) throw new OAuthError('invalid_grant', 'refresh token was issued to another client');
  if (row.refresh_expires_at && Date.parse(row.refresh_expires_at) < Date.now()) throw new OAuthError('invalid_grant', 'refresh token expired');
  const scopes = scope ? parseScopes(scope).filter((s) => row.scopes.includes(s)) : row.scopes;
  return mint(sb, { client_id: row.client_id, user_id: row.user_id, organization_id: row.organization_id, scopes: scopes.length ? scopes : row.scopes, resource: row.resource }, row.id);
}

export async function revokeToken(client: OAuthClient, token: string): Promise<void> {
  if (!token) return;
  const h = sha256(token);
  const sb = serviceClient();
  await sb.from('oauth_tokens').update({ revoked_at: new Date().toISOString() }).eq('client_id', client.client_id).or(`token_hash.eq.${h},refresh_hash.eq.${h}`);
}

export interface AccessPrincipal { tokenId: string; userId: string; orgId: string; orgSlug: string; orgName: string; scopes: string[]; clientId: string }

export async function verifyAccessToken(token: string): Promise<AccessPrincipal | null> {
  if (!token.startsWith('mco_')) return null;
  const sb = serviceClient();
  const { data } = await sb
    .from('oauth_tokens')
    .select('id, user_id, organization_id, scopes, client_id, expires_at, revoked_at, last_used_at, organizations(slug, name, status)')
    .eq('token_hash', sha256(token))
    .maybeSingle();
  if (!data || data.revoked_at || Date.parse(data.expires_at) < Date.now()) return null;
  const org = (data as any).organizations as { slug: string; name: string; status: string } | null;
  if (!org || org.status !== 'active') return null;
  const last = data.last_used_at ? Date.parse(data.last_used_at) : 0;
  if (Date.now() - last > 5 * 60_000) void sb.from('oauth_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => undefined, () => undefined);
  return { tokenId: data.id, userId: data.user_id, orgId: data.organization_id, orgSlug: org.slug, orgName: org.name, scopes: data.scopes ?? ['read'], clientId: data.client_id };
}

/** Parse a token-endpoint body (form or JSON) plus HTTP Basic client credentials. */
export async function readTokenRequest(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') || '';
  let body: Record<string, string> = {};
  if (ct.includes('application/json')) {
    const j = await req.json().catch(() => ({}));
    for (const [k, v] of Object.entries(j ?? {})) if (typeof v === 'string') body[k] = v;
  } else {
    const text = await req.text().catch(() => '');
    body = Object.fromEntries(new URLSearchParams(text).entries());
  }
  const basic = req.headers.get('authorization');
  if (basic && /^Basic\s+/i.test(basic)) {
    try {
      const [id, secret] = Buffer.from(basic.replace(/^Basic\s+/i, ''), 'base64').toString('utf8').split(':');
      if (id && !body.client_id) body.client_id = decodeURIComponent(id);
      if (secret && !body.client_secret) body.client_secret = decodeURIComponent(secret);
    } catch { /* ignore malformed header */ }
  }
  return body;
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

export function oauthJson(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Pragma: 'no-cache', ...CORS_HEADERS, ...extra } });
}

export function oauthErrorResponse(e: unknown): Response {
  if (e instanceof OAuthError) return oauthJson({ error: e.code, error_description: e.message }, e.status);
  return oauthJson({ error: 'server_error', error_description: e instanceof Error ? e.message : String(e) }, 500);
}
