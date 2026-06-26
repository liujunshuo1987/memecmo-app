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
  const groups = await Promise.all(
    orgs.map(async (org) => ({ org, projects: await listProjectsForOrg(org.id) })),
  );

  return <DashboardClient groups={groups} userEmail={user.email ?? ''} />;
}
