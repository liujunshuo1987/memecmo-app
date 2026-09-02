// Inngest functions — the actual background workers.

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { inngest } from './client';
import { executeAgentRun } from '@/lib/agents/run';
import { recordUsage, isMeteredKind } from '@/lib/commerce';
import { sendProjectDigest, maybeSendScanAlert } from '@/lib/reports/digest';
import { applyMonthlyGrant, applyPlanAllowance } from '@/lib/credits';
import { sendEmail } from '@/lib/email';
import { previewReadyEmail, nurtureD1Email, nurtureD3Email, nurtureD7Email, TrialEmailCtx } from '@/lib/emails/trial';

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Scheduled cadence (FMVN §4.5 / E2 / M4-M5) ───────────────────────────────
// Weekly re-measure + monthly report & competitor patrol. Gated twice so it
// never burns credits unintentionally:
//   1. global kill-switch  SCHEDULED_SCANS_ENABLED=1
//   2. per-project opt-in   projects.metadata.reporting ∈ {'weekly','monthly'}
// Scheduled runs are metered (visibility) but NEVER quota-blocked — they are
// the contracted deliverable, not client-initiated usage.

function schedulingEnabled(): boolean {
  return process.env.SCHEDULED_SCANS_ENABLED === '1';
}

// Active projects (with active org) opted into one of the given cadences.
async function listScheduledProjects(cadences: string[]): Promise<{ id: string; organization_id: string; schedule: any }[]> {
  const sb = svc();
  const { data } = await sb
    .from('projects')
    .select('id, organization_id, metadata, status, organizations!inner(status)')
    .eq('status', 'active')
    .in('metadata->>reporting', cadences);
  return (data ?? [])
    .filter((p: any) => p.organizations?.status === 'active')
    .map((p: any) => ({ id: p.id, organization_id: p.organization_id, schedule: p.metadata?.reportSchedule ?? {} }));
}

// Insert a queued run + hand off to Inngest, exactly like the HTTP endpoint but
// server-side (no quota gate). Returns the new run id, or null on failure.
async function enqueueScheduledRun(projectId: string, organizationId: string, agentId: string): Promise<string | null> {
  const sb = svc();
  const { data: run, error } = await sb
    .from('agent_runs')
    .insert({ project_id: projectId, agent_id: agentId, trigger_method: 'schedule', status: 'queued' })
    .select('id')
    .single();
  if (error || !run) return null;
  await inngest.send({ name: 'agent/run.requested', data: { runId: run.id, agentId, projectId } });
  if (isMeteredKind(agentId)) await recordUsage({ orgId: organizationId, projectId, agentRunId: run.id, kind: agentId });
  return run.id;
}

// Handles 'agent/run.requested' — runs the requested agent end-to-end.
// concurrency + retries are configured here; step-level durability comes
// for free for any step.run() we add inside the agents later (v0.6 monitor).
export const runAgent = inngest.createFunction(
  {
    id: 'run-agent',
    name: 'Run GEO agent',
    // Cap parallel agent runs so a burst doesn't exhaust LLM rate limits.
    concurrency: { limit: 5 },
    retries: 2,
    // Inngest v4: the trigger lives inside the options object.
    triggers: [{ event: 'agent/run.requested' }],
  },
  async ({ event, step }) => {
    const { runId, agentId, projectId } = event.data;
    const sb = svc();

    // 1. Load project (service role — Inngest has no user session)
    const project = await step.run('load-project', async () => {
      const { data, error } = await sb
        .from('projects')
        .select('id, brand_name, brand_url, target_country, target_language, industry, metadata')
        .eq('id', projectId)
        .single();
      if (error || !data) throw new Error(`Project ${projectId} not found: ${error?.message}`);
      // Product-line axis: the scope is stored clean in metadata (UI shows it
      // as a chip); here — the single choke point every agent run passes
      // through — it is composed into the industry context so discovery,
      // competitor extraction and judging all lock onto the one line.
      const productLine = (data as any).metadata?.productLine;
      if (productLine) {
        (data as any).industry = [
          data.industry,
          `PRODUCT LINE SCOPE: ${productLine}. Scope ALL analysis (prompts, competitors, judging) to THIS product line only.`,
        ].filter(Boolean).join(' — ');
      }
      return data;
    });

    // 2. Mark running (idempotent: only flips from queued)
    await step.run('mark-running', async () => {
      await sb
        .from('agent_runs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', runId)
        .eq('status', 'queued');
      return true;
    });

    // 3. Execute the agent. `step` is passed through so long cascades
    //    (full_scan) checkpoint each phase as its own Inngest step → each runs
    //    in a separate, short Vercel invocation and resumes durably, instead of
    //    one long invocation that hits the function-duration ceiling and stalls.
    await executeAgentRun(runId, agentId, project, async () => {}, step);

    // 4. Event-triggered client alert: a completed scan that shows a big score
    //    drop or an engine collapse emails the client immediately instead of
    //    waiting for the weekly digest. Inert unless reportSchedule.recipients
    //    is configured; deduped per run id inside.
    if (agentId === 'monitor' || agentId === 'full_scan') {
      await step.run('scan-alert', () => maybeSendScanAlert(sb, projectId, runId));
    }

    // Funnel D4/E1: a completed trial preview mails the visitor a link back to
    // their report — the win-back for tabs closed mid-scan. Idempotent via the
    // funnel_events row.
    if (agentId === 'full_scan') {
      await step.run('preview-email', async () => {
        const { data: run } = await sb
          .from('agent_runs')
          .select('trigger_method, status, output, triggered_by')
          .eq('id', runId)
          .maybeSingle();
        if (run?.trigger_method !== 'preview' || run.status !== 'completed' || !run.triggered_by) return 'not-a-preview';
        const { data: project } = await sb
          .from('projects')
          .select('slug, brand_name, target_language, organization_id')
          .eq('id', projectId)
          .single();
        const { data: org } = await sb
          .from('organizations')
          .select('slug, billing_email')
          .eq('id', project!.organization_id)
          .single();
        if (!org?.billing_email) return 'no-email';
        const { data: dup } = await sb
          .from('funnel_events')
          .select('id')
          .eq('event', 'email_preview_ready')
          .eq('meta->>runId', runId)
          .maybeSingle();
        if (dup) return 'already-sent';
        const out: any = run.output || {};
        const ctx: TrialEmailCtx = {
          brand: project!.brand_name,
          orgSlug: org.slug,
          projectSlug: project!.slug,
          lang: project!.target_language === 'vi' ? 'vi' : 'en',
          score: out.aigvrScore ?? null,
          gaps: Array.isArray(out.scorecard?.gaps) ? out.scorecard.gaps.length : null,
        };
        const mail = previewReadyEmail(ctx);
        const res = await sendEmail({ to: [org.billing_email], subject: mail.subject, html: mail.html });
        await sb.from('funnel_events').insert({
          organization_id: project!.organization_id,
          event: 'email_preview_ready',
          meta: { runId, sent: res.sent, to: org.billing_email },
        });
        return res.sent ? 'sent' : `failed: ${res.error}`;
      });
    }

    return { runId, agentId, status: 'done' };
  },
);

// Weekly re-measure (Mondays 02:00 UTC) — fresh scorecard + trend + competitor
// patrol for projects opted into weekly reporting. This is the "周报" data pull.
export const scheduledWeekly = inngest.createFunction(
  // Fires daily; each project scans on ITS configured day (UTC dow, default
  // Monday). Clients align the cadence to their management rhythm — FMVN:
  // Friday scan → Saturday digest → Monday leadership meeting (client request
  // 2026-08). metadata.reportSchedule.scanDay: 0=Sun … 6=Sat.
  { id: 'scheduled-weekly', name: 'Weekly GEO re-measure', triggers: [{ cron: '0 2 * * *' }] },
  async ({ step }) => {
    if (!schedulingEnabled()) return { skipped: 'SCHEDULED_SCANS_ENABLED!=1' };
    const dow = new Date().getUTCDay();
    const projects = (await step.run('list-weekly', () => listScheduledProjects(['weekly'])))
      .filter((p) => ((p.schedule?.scanDay ?? 1) === dow));
    let enqueued = 0;
    for (const p of projects) {
      const id = await step.run(`monitor-${p.id}`, () => enqueueScheduledRun(p.id, p.organization_id, 'monitor'));
      if (id) enqueued++;
    }
    return { cadence: 'weekly', projects: projects.length, enqueued };
  },
);

// Monthly (1st, 03:00 UTC) — re-measure for monthly-cadence projects, then a
// report for every scheduled project. Covers M4 competitor patrol + M5 monthly
// maintenance report. Report synthesizes the latest scorecard.
export const scheduledMonthly = inngest.createFunction(
  { id: 'scheduled-monthly', name: 'Monthly GEO report & patrol', triggers: [{ cron: '0 3 1 * *' }] },
  async ({ step }) => {
    if (!schedulingEnabled()) return { skipped: 'SCHEDULED_SCANS_ENABLED!=1' };
    const monthly = await step.run('list-monthly', () => listScheduledProjects(['monthly']));
    for (const p of monthly) {
      await step.run(`monitor-${p.id}`, () => enqueueScheduledRun(p.id, p.organization_id, 'monitor'));
    }
    const all = await step.run('list-all', () => listScheduledProjects(['weekly', 'monthly']));
    let reports = 0;
    for (const p of all) {
      const id = await step.run(`report-${p.id}`, () => enqueueScheduledRun(p.id, p.organization_id, 'report'));
      if (id) reports++;
    }
    // Monthly credit allowances (e.g. FMVN flagship 200/mo capped at 600) —
    // orgs with metadata.monthlyCreditGrant, granted pool, capped.
    const granted = await step.run('monthly-credit-grants', async () => {
      const sb = svc();
      const { data: orgs } = await sb.from('organizations').select('id, metadata').eq('status', 'active');
      let total = 0;
      for (const o of orgs ?? []) {
        if ((o.metadata as any)?.monthlyCreditGrant) total += await applyMonthlyGrant(sb, o as any);
      }
      // Plan-included allowances (plans.included_credits_monthly) for orgs
      // with a live subscription — the other half of the credits promise.
      const { data: subs } = await sb
        .from('org_subscriptions')
        .select('organization_id, status, plans!inner(included_credits_monthly)')
        .in('status', ['trialing', 'active']);
      for (const s of subs ?? []) {
        total += await applyPlanAllowance(sb, s.organization_id, (s.plans as any)?.included_credits_monthly ?? 0);
      }
      return total;
    });
    return { cadence: 'monthly', monitored: monthly.length, reports, creditsGranted: granted };
  },
);

// Weekly client digest (Tuesdays 02:00 UTC = 09:00 ICT) — one day after the
// Monday re-measure so the email reads FRESH data. Concise summary + detailed
// attribution/strategy interpretation; full report stays in the workspace PDF.
// Doubly gated like the scans: global kill-switch + per-project recipients.
export const scheduledDigest = inngest.createFunction(
  // Daily cron + per-project digestDay (default Tuesday); manual trigger
  // event unchanged. FMVN: digestDay=6 (Saturday).
  { id: 'scheduled-digest', name: 'Weekly client digest email', triggers: [{ cron: '0 2 * * *' }, { event: 'digest/manual.requested' }] },
  async ({ step, event }) => {
    if (!schedulingEnabled()) return { skipped: 'SCHEDULED_SCANS_ENABLED!=1' };
    const manual = event?.name === 'digest/manual.requested';
    const dow = new Date().getUTCDay();
    const sb = svc();
    const projects = await step.run('list-digest', async () => {
      const { data } = await sb
        .from('projects')
        .select('id, metadata, status, organizations!inner(status)')
        .eq('status', 'active');
      return (data ?? [])
        .filter((p: any) => p.organizations?.status === 'active')
        .filter((p: any) => (p.metadata?.reportSchedule?.recipients ?? []).length > 0)
        .filter((p: any) => manual || (p.metadata?.reportSchedule?.digestDay ?? 2) === dow)
        .map((p: any) => ({ id: p.id }));
    });
    let sent = 0;
    for (const p of projects) {
      const res = await step.run(`digest-${p.id}`, () => sendProjectDigest(sb, p.id));
      if ((res as any)?.sent) sent++;
    }
    return { cadence: 'digest', projects: projects.length, sent };
  },
);

// Trial nurture (funnel D4/E2-E4) — daily 03:30 UTC (10:30 Hanoi morning).
// Unconverted trial orgs get exactly three more touches after the preview
// email: day 1 (interpret gaps), day 3 (FMVN proof), day 7 (honest close).
// Each is sent once, deduped through funnel_events; conversion (trial=false)
// or a recorded opt-out stops the sequence.
const NURTURE_STAGES: { event: string; minDays: number; build: (c: TrialEmailCtx) => { subject: string; html: string } }[] = [
  { event: 'email_nurture_d1', minDays: 1, build: nurtureD1Email },
  { event: 'email_nurture_d3', minDays: 3, build: nurtureD3Email },
  { event: 'email_nurture_d7', minDays: 7, build: nurtureD7Email },
];

export const scheduledTrialNurture = inngest.createFunction(
  { id: 'trial-nurture', name: 'Trial nurture emails', triggers: [{ cron: '30 3 * * *' }] },
  async ({ step }) => {
    const sb = svc();
    const sent: string[] = [];
    const orgs = await step.run('list-trial-orgs', async () => {
      const { data } = await sb
        .from('organizations')
        .select('id, slug, billing_email, created_at, metadata')
        .eq('metadata->>trial', 'true')
        .eq('metadata->>selfServe', 'true');
      return data ?? [];
    });
    for (const org of orgs) {
      if (!org.billing_email) continue;
      const ageDays = (Date.now() - new Date(org.created_at).getTime()) / 86400000;
      const stage = [...NURTURE_STAGES].reverse().find((s) => ageDays >= s.minDays);
      if (!stage) continue;
      await step.run(`nurture-${org.id}`, async () => {
        const { data: history } = await sb
          .from('funnel_events')
          .select('event')
          .eq('organization_id', org.id)
          .in('event', [...NURTURE_STAGES.map((s) => s.event), 'email_optout']);
        const seen = new Set((history ?? []).map((h) => h.event));
        if (seen.has('email_optout') || seen.has(stage.event)) return 'skip';
        const { data: project } = await sb
          .from('projects')
          .select('slug, brand_name, target_language, id')
          .eq('organization_id', org.id)
          .limit(1)
          .maybeSingle();
        if (!project) return 'no-project';
        const { data: run } = await sb
          .from('agent_runs')
          .select('output')
          .eq('project_id', project.id)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const out: any = run?.output || {};
        const ctx: TrialEmailCtx = {
          brand: project.brand_name,
          orgSlug: org.slug,
          projectSlug: project.slug,
          lang: project.target_language === 'vi' ? 'vi' : 'en',
          score: out.aigvrScore ?? null,
          gaps: Array.isArray(out.scorecard?.gaps) ? out.scorecard.gaps.length : null,
        };
        const mail = stage.build(ctx);
        const res = await sendEmail({ to: [org.billing_email], subject: mail.subject, html: mail.html });
        await sb.from('funnel_events').insert({ organization_id: org.id, event: stage.event, meta: { sent: res.sent, to: org.billing_email } });
        sent.push(`${org.slug}:${stage.event}`);
        return res.sent ? 'sent' : `failed: ${res.error}`;
      });
    }
    return { trialOrgs: orgs.length, sent };
  },
);

export const functions = [runAgent, scheduledWeekly, scheduledMonthly, scheduledDigest, scheduledTrialNurture];
