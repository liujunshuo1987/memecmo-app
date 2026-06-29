// Workspace home — lists the orgs the user belongs to and their projects.
// Server component (RLS-protected); interactivity (new project, sign out) lives
// in the client component.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listMyOrgs, listProjectsForOrg } from '@/lib/workspace';
import DashboardClient from './dashboard-workspace';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');

  const orgs = await listMyOrgs();
  const { data: mems } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id);
  const roleByOrg: Record<string, string> = Object.fromEntries((mems ?? []).map((m) => [m.organization_id, m.role]));
  const rootOrg = orgs.find((o) => o.type === 'root');
  const isRootAdmin = !!rootOrg && roleByOrg[rootOrg.id] === 'admin';

  const groups = await Promise.all(
    orgs.map(async (org) => ({ org, role: roleByOrg[org.id] ?? null, projects: await listProjectsForOrg(org.id) })),
  );

  return <DashboardClient groups={groups} userEmail={user.email ?? ''} isRootAdmin={isRootAdmin} />;
}
