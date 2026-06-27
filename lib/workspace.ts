// Workspace data-access helpers — multi-tenant org/project lookups.
// All queries flow through Supabase RLS so callers automatically get
// only what their auth.uid() is allowed to see.

import { createClient } from '@/lib/supabase/server';

export interface Organization {
  id: string;
  slug: string;
  name: string;
  type: 'root' | 'channel_partner' | 'end_client';
  parent_org_id: string | null;
  status: 'pending_approval' | 'active' | 'suspended';
  billing_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  slug: string;
  brand_name: string;
  brand_url: string | null;
  target_country: string;
  target_language: string | null;
  industry: string | null;
  description: string | null;
  status: 'active' | 'paused' | 'archived';
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentRun {
  id: string;
  project_id: string;
  agent_id: string;
  triggered_by: string | null;
  trigger_method: 'chat' | 'schedule' | 'api' | 'cascade';
  input_prompt: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  progress_pct: number;
  summary: string | null;
  output: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface AgentRunEvent {
  id: string;
  agent_run_id: string;
  ts: string;
  event_type:
    | 'log'
    | 'tool_call'
    | 'tool_result'
    | 'progress'
    | 'output_chunk'
    | 'error'
    | 'milestone';
  payload: Record<string, unknown>;
}

// ─── Auth ───────────────────────────────────────────────────────────────────
export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return user;
}

// ─── Orgs ───────────────────────────────────────────────────────────────────
export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  return data as Organization | null;
}

export async function listMyOrgs(): Promise<Organization[]> {
  const supabase = createClient();
  // RLS handles the filtering — we only see orgs we're members of (or parent of)
  const { data } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: true });
  return (data as Organization[]) ?? [];
}

// ─── Projects ───────────────────────────────────────────────────────────────
export async function getProjectBySlug(
  orgSlug: string,
  projectSlug: string,
): Promise<{ project: Project; organization: Organization } | null> {
  const org = await getOrgBySlug(orgSlug);
  if (!org) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('organization_id', org.id)
    .eq('slug', projectSlug)
    .maybeSingle();
  if (!data) return null;
  return { project: data as Project, organization: org };
}

export async function listProjectsForOrg(orgId: string): Promise<Project[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('organization_id', orgId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false });
  return (data as Project[]) ?? [];
}

// ─── Agent runs ─────────────────────────────────────────────────────────────
export async function getRecentRuns(projectId: string, limit = 20): Promise<AgentRun[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as AgentRun[]) ?? [];
}

// ─── Scan history (closed loop) ─────────────────────────────────────────────
// Every Monitor / Full-Scan run already persists its scorecard in
// agent_runs.output, so the trend over time is derivable without a new table.
export interface ScanPoint {
  runId: string;
  ts: string;
  aigvr: number | null;
  presence: number | null;
  rank: number | null;
  gaps: number;
  prominence: number | null;
  sentiment: number | null;
  citation: number | null;
  competitive: number | null;
}

export async function getScanHistory(projectId: string): Promise<ScanPoint[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('agent_runs')
    .select('id, created_at, output')
    .eq('project_id', projectId)
    .in('agent_id', ['monitor', 'full_scan'])
    .eq('status', 'completed')
    .order('created_at', { ascending: true });
  return ((data as { id: string; created_at: string; output: Record<string, any> | null }[]) ?? [])
    .map((r) => {
      const o = r.output || {};
      const sc = o.scorecard ?? o; // full_scan nests the scorecard
      const d = sc.dimensions || {};
      return {
        runId: r.id,
        ts: r.created_at,
        aigvr: sc.aigvrScore ?? null,
        presence: d.presence ?? null,
        rank: sc.brandRank ?? null,
        gaps: (sc.gaps || []).length,
        prominence: d.prominence ?? null,
        sentiment: d.sentiment ?? null,
        citation: d.citation ?? null,
        competitive: d.competitiveShare ?? null,
      };
    })
    .filter((p) => p.aigvr != null);
}

export async function getRun(runId: string): Promise<AgentRun | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();
  return (data as AgentRun) ?? null;
}

export async function getRunEvents(runId: string, sinceTs?: string): Promise<AgentRunEvent[]> {
  const supabase = createClient();
  let q = supabase.from('agent_run_events').select('*').eq('agent_run_id', runId);
  if (sinceTs) q = q.gt('ts', sinceTs);
  const { data } = await q.order('ts', { ascending: true });
  return (data as AgentRunEvent[]) ?? [];
}
