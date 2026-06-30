// Commercial layer (③) — subscription/plan/usage logic over the entities in
// migration 20260630_invites_and_commercial.sql.
//
// Design intent (first principles):
//  - Metering is harmless and always-on: every billable run is recorded.
//  - Enforcement is conservative: only `end_client` orgs are metered/blocked.
//    The operator's own orgs (root) and the channel partner (channel_partner)
//    are never blocked — internal use and demos must never hit a paywall.
//  - Writes go through the service role (RLS exposes reads to members only).

import { createClient as createServiceClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_PLAN_ID = 'standard';

// Run kinds that consume a "scan" against the monthly quota. Follow-up agents
// (optimize/report/etc.) are cheap derivatives of a scan and are not metered.
const METERED_KINDS = new Set(['full_scan', 'monitor']);

export interface Plan {
  id: string;
  name: string;
  monthly_scan_quota: number;
  max_projects: number;
  price_usd_month: number | null;
  features: Record<string, unknown>;
}

export interface QuotaStatus {
  metered: boolean;          // false for root/channel_partner — never blocked
  planId: string | null;
  planName: string | null;
  quota: number;             // scans allowed this period
  used: number;              // metered scans used this period
  remaining: number;
  periodEnd: string | null;
  overQuota: boolean;
}

export function serviceClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export function isMeteredKind(kind: string): boolean {
  return METERED_KINDS.has(kind);
}

/** Ensure an org has a subscription row; create a trialing one if missing. */
export async function ensureSubscription(
  sb: SupabaseClient,
  orgId: string,
  planId: string = DEFAULT_PLAN_ID,
): Promise<void> {
  const { data: existing } = await sb
    .from('org_subscriptions')
    .select('id')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (existing) return;
  await sb.from('org_subscriptions').insert({
    organization_id: orgId,
    plan_id: planId,
    status: 'trialing',
  });
}

/**
 * Compute quota status for the org that owns `projectId`. Uses a service client
 * so it works regardless of the caller's RLS scope. Never throws on missing
 * data — degrades to unmetered so a config gap can't block a run.
 */
export async function getQuotaStatusForProject(projectId: string): Promise<QuotaStatus> {
  const unmetered: QuotaStatus = {
    metered: false, planId: null, planName: null,
    quota: 0, used: 0, remaining: 0, periodEnd: null, overQuota: false,
  };
  const sb = serviceClient();

  const { data: project } = await sb
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project?.organization_id) return unmetered;
  const orgId = project.organization_id as string;

  const { data: org } = await sb
    .from('organizations')
    .select('id, type')
    .eq('id', orgId)
    .maybeSingle();
  // Only end clients are metered. Operator + channel partner run free.
  if (!org || org.type !== 'end_client') return unmetered;

  // Ensure a subscription exists, then read plan + period.
  await ensureSubscription(sb, orgId);
  const { data: sub } = await sb
    .from('org_subscriptions')
    .select('plan_id, current_period_start, current_period_end, status')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!sub) return unmetered;

  const { data: plan } = await sb
    .from('plans')
    .select('id, name, monthly_scan_quota')
    .eq('id', sub.plan_id)
    .maybeSingle();
  const quota = plan?.monthly_scan_quota ?? 0;

  // Count metered usage in the current period.
  const { count } = await sb
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('kind', Array.from(METERED_KINDS))
    .gte('ts', sub.current_period_start);

  const used = count ?? 0;
  return {
    metered: true,
    planId: sub.plan_id,
    planName: plan?.name ?? sub.plan_id,
    quota,
    used,
    remaining: Math.max(0, quota - used),
    periodEnd: sub.current_period_end as string,
    overQuota: used >= quota,
  };
}

/** Record a usage event (no-op-safe; swallow errors so metering never breaks a run). */
export async function recordUsage(args: {
  orgId: string;
  projectId: string;
  agentRunId: string;
  kind: string;
}): Promise<void> {
  try {
    const sb = serviceClient();
    await sb.from('usage_events').insert({
      organization_id: args.orgId,
      project_id: args.projectId,
      agent_run_id: args.agentRunId,
      kind: args.kind,
      qty: 1,
    });
  } catch {
    /* metering must never block execution */
  }
}

/** Resolve the owning org id for a project (service-role read). */
export async function orgIdForProject(projectId: string): Promise<string | null> {
  const sb = serviceClient();
  const { data } = await sb
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle();
  return (data?.organization_id as string) ?? null;
}
