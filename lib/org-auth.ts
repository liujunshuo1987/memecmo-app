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
