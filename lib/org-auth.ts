// Shared org-admin check: admin of the org itself, of its parent (channel
// partner manages its end clients), or of the MemeCMO root org.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function canAdminOrg(
  authed: SupabaseClient,
  userId: string,
  org: { id: string; parent_org_id: string | null },
): Promise<boolean> {
  const ids = [org.id];
  if (org.parent_org_id) ids.push(org.parent_org_id);
  const { data: mems } = await authed
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .in('organization_id', ids)
    .eq('role', 'admin');
  if (mems && mems.length) return true;
  const { data: root } = await authed.from('organizations').select('id').eq('type', 'root').maybeSingle();
  if (!root) return false;
  const { data: rmem } = await authed
    .from('organization_members')
    .select('role')
    .eq('organization_id', root.id)
    .eq('user_id', userId)
    .maybeSingle();
  return rmem?.role === 'admin';
}

/** Any membership (any role) in the org, its parent, or the root org.
 *  Channel-partner operating teams (FMVN meeting 2026-09-23) edit prompt
 *  wording and competitor marks themselves — that work is member-level, not
 *  admin-level; the edit log carries the author for accountability. */
export async function canAccessOrg(
  authed: SupabaseClient,
  userId: string,
  org: { id: string; parent_org_id: string | null },
): Promise<boolean> {
  const ids = [org.id];
  if (org.parent_org_id) ids.push(org.parent_org_id);
  const { data: mems } = await authed
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .in('organization_id', ids)
    .limit(1);
  if (mems && mems.length) return true;
  const { data: root } = await authed.from('organizations').select('id').eq('type', 'root').maybeSingle();
  if (!root) return false;
  const { data: rmem } = await authed
    .from('organization_members')
    .select('role')
    .eq('organization_id', root.id)
    .eq('user_id', userId)
    .maybeSingle();
  return !!rmem;
}

/** Is the caller a member of the root (operator) org? Operator delivery runs
 *  are part of the contracted service — never credit-charged — and operator-
 *  only endpoints (engine health, digest preview) gate on this. */
export async function isOperator(supabase: any, userId: string): Promise<boolean> {
  const { data: root } = await supabase.from('organizations').select('id').eq('type', 'root').maybeSingle();
  if (!root) return false;
  const { data: mem } = await supabase
    .from('organization_members').select('role').eq('organization_id', root.id).eq('user_id', userId).maybeSingle();
  return !!mem;
}
