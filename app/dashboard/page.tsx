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

  // ③ Commercial: subscription + period usage per end-client org (RLS-scoped).
  const endClientIds = orgs.filter((o) => o.type === 'end_client').map((o) => o.id);
  const billing: Record<string, { planId: string; planName: string; quota: number; used: number; status: string; hasStripeSub: boolean }> = {};
  if (endClientIds.length) {
    const { data: subs } = await supabase
      .from('org_subscriptions')
      .select('organization_id, status, current_period_start, plan_id, stripe_subscription_id, plans(name, monthly_scan_quota)')
      .in('organization_id', endClientIds);
    for (const s of subs ?? []) {
      const plan = (s as any).plans;
      const { count } = await supabase
        .from('usage_events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', s.organization_id)
        .in('kind', ['full_scan', 'monitor'])
        .gte('ts', s.current_period_start);
      billing[s.organization_id] = {
        planId: s.plan_id,
        planName: plan?.name ?? '—',
        quota: plan?.monthly_scan_quota ?? 0,
        used: count ?? 0,
        status: s.status,
        hasStripeSub: !!s.stripe_subscription_id,
      };
    }
  }

  // Plans catalogue (public read) + whether payments are live on this deploy.
  const { data: plansCatalog } = await supabase
    .from('plans')
    .select('id, name, price_usd_month, monthly_scan_quota, max_projects, stripe_price_id')
    .order('sort');
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const stripeReady = stripeKey.startsWith('sk_') && stripeKey.length > 20;

  return (
    <DashboardClient
      groups={groups}
      userEmail={user.email ?? ''}
      isRootAdmin={isRootAdmin}
      billing={billing}
      plansCatalog={plansCatalog ?? []}
      stripeReady={stripeReady}
    />
  );
}
