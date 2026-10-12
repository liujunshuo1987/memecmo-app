// Connector credentials — two kinds of bearer token, one principal shape.
//
//   mc_…   connector key: issued by an org admin in the dashboard, belongs to
//          the organization; actions are signed by the admin who issued it.
//   mco_…  OAuth access token: a signed-in user who chose an organization on
//          the consent page (Claude.ai, ChatGPT, directory clients); actions
//          are signed by that user.
//
// Either way the principal is scoped to ONE organization (plus its direct
// client organizations). Only hashes are stored; verification is one lookup.

import { createHash, randomBytes } from 'node:crypto';
import { serviceClient } from '@/lib/commerce';
import { verifyAccessToken } from '@/lib/oauth/server';

export const KEY_PREFIX = 'mc_';

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** A fresh key: 240 bits of randomness, url-safe, shown to the admin once. */
export function generateKey(): { key: string; prefix: string; hash: string } {
  const key = `${KEY_PREFIX}${randomBytes(30).toString('base64url')}`;
  return { key, prefix: key.slice(0, 11), hash: hashKey(key) };
}

export interface ConnectorPrincipal {
  kind: 'key' | 'oauth';
  keyId: string | null;
  tokenId: string | null;
  /** The signed-in user (OAuth) — null for keys. */
  userId: string | null;
  orgId: string;
  orgSlug: string;
  orgName: string;
  scopes: string[];
  /** Who signs actions: the OAuth user, or the admin who issued the key. */
  createdBy: string | null;
}

export async function verifyConnectorKey(token: string): Promise<ConnectorPrincipal | null> {
  if (!token || !token.startsWith(KEY_PREFIX) || token.length < 20) return null;
  const sb = serviceClient();
  const { data } = await sb
    .from('connector_keys')
    .select('id, organization_id, scopes, created_by, last_used_at, revoked_at, organizations(slug, name, status)')
    .eq('key_hash', hashKey(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  const org = (data as any).organizations as { slug: string; name: string; status: string } | null;
  if (!org || org.status !== 'active') return null;
  // last_used_at is informational; write it at most every 5 minutes, never await it.
  const last = data.last_used_at ? Date.parse(data.last_used_at) : 0;
  if (Date.now() - last > 5 * 60_000) {
    void sb.from('connector_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => undefined, () => undefined);
  }
  return {
    kind: 'key', keyId: data.id, tokenId: null, userId: null,
    orgId: data.organization_id, orgSlug: org.slug, orgName: org.name,
    scopes: (data.scopes as string[] | null) ?? ['read', 'write'],
    createdBy: data.created_by ?? null,
  };
}

/** Dispatch on the token prefix. */
export async function verifyBearer(token: string): Promise<ConnectorPrincipal | null> {
  if (!token) return null;
  if (token.startsWith(KEY_PREFIX)) return verifyConnectorKey(token);
  if (token.startsWith('mco_')) {
    const p = await verifyAccessToken(token);
    if (!p) return null;
    return { kind: 'oauth', keyId: null, tokenId: p.tokenId, userId: p.userId, orgId: p.orgId, orgSlug: p.orgSlug, orgName: p.orgName, scopes: p.scopes, createdBy: p.userId };
  }
  return null;
}

/** Usage log — one row per tool call; the basis for metering and audit. Never awaited by callers. */
export function logConnectorEvent(e: { principal: ConnectorPrincipal; projectId?: string | null; tool: string; ok: boolean; ms: number }): void {
  const sb = serviceClient();
  void sb
    .from('connector_events')
    .insert({
      key_id: e.principal.keyId, oauth_token_id: e.principal.tokenId, user_id: e.principal.userId,
      organization_id: e.principal.orgId, project_id: e.projectId ?? null, tool: e.tool, ok: e.ok, ms: Math.round(e.ms),
    })
    .then(() => undefined, () => undefined);
}
