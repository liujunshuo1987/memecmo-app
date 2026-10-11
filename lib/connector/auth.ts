// Connector keys — bearer credentials for the MemeCMO MCP connector.
//
// A key belongs to ONE organization (and, through it, the organization's own
// projects plus its direct client organizations when it is a channel partner).
// Only the sha256 hash is stored; verification is a single indexed lookup.

import { createHash, randomBytes } from 'node:crypto';
import { serviceClient } from '@/lib/commerce';

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
  keyId: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  scopes: string[];
  /** The admin who issued the key — actions logged through it are signed with this account. */
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
    keyId: data.id,
    orgId: data.organization_id,
    orgSlug: org.slug,
    orgName: org.name,
    scopes: (data.scopes as string[] | null) ?? ['read', 'write'],
    createdBy: data.created_by ?? null,
  };
}

/** Usage log — one row per tool call; the basis for metering and audit. Never awaited by callers. */
export function logConnectorEvent(e: { keyId: string; orgId: string; projectId?: string | null; tool: string; ok: boolean; ms: number }): void {
  const sb = serviceClient();
  void sb
    .from('connector_events')
    .insert({ key_id: e.keyId, organization_id: e.orgId, project_id: e.projectId ?? null, tool: e.tool, ok: e.ok, ms: Math.round(e.ms) })
    .then(() => undefined, () => undefined);
}
