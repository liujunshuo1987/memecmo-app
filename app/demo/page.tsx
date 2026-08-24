// Public live demo — a real project on the production engine, served read-only
// to anonymous visitors. Weekly scheduled scans keep it fresh; every run
// button is replaced by a sign-up CTA (demoMode). Data loads via the service
// role for this ONE whitelisted project only.

import type { Metadata } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import WorkspaceClient from '../workspace/[orgSlug]/[projectSlug]/workspace-client';

export const metadata: Metadata = {
  title: 'Live Demo — MemeCMO GEO Workspace',
  description:
    'A real brand, really measured: presence, share of voice, citation rate, AI sentiment and answer accuracy across ChatGPT, Gemini, Perplexity, Claude and Google AI Overview — refreshed weekly. Read-only.',
  alternates: { canonical: 'https://app.memecmo.ai/demo' },
};

export const revalidate = 3600; // demo data changes weekly; cache aggressively

const DEMO_SLUG = 'demo-highlands';

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export default async function DemoPage() {
  const sb = svc();
  const { data: project } = await sb
    .from('projects')
    .select('*, organizations!inner(*)')
    .eq('slug', DEMO_SLUG)
    .maybeSingle();
  if (!project) {
    return (
      <div className="theme-day min-h-screen bg-canvas text-ink flex items-center justify-center">
        <p className="text-sm text-dim">The live demo is being prepared — check back shortly.</p>
      </div>
    );
  }
  const organization = project.organizations as any;

  const { data: runs } = await sb
    .from('agent_runs')
    .select('id, agent_id, status, progress_pct, summary, output, error_message, created_at, completed_at')
    .eq('project_id', project.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(25);

  // Scan history for the trend card (mirror lib/workspace getScanHistory shape).
  const history = (runs ?? [])
    .filter((r) => (r.agent_id === 'monitor' || r.agent_id === 'full_scan'))
    .map((r) => {
      const sc = (r.output as any)?.scorecard ?? r.output;
      if (!sc || sc.aigvrScore == null) return null;
      const d = sc.dimensions || {};
      return {
        runId: r.id, ts: r.completed_at ?? r.created_at,
        aigvr: sc.aigvrScore ?? null, presence: d.presence ?? null,
        rank: sc.brandRank ?? null,
        topOfMind: sc.topOfMind?.overallRate ?? null,
        gaps: (sc.gaps || []).length,
      };
    })
    .filter(Boolean)
    .reverse() as any[];

  return (
    <WorkspaceClient
      project={project as any}
      organization={organization}
      initialRuns={(runs ?? []) as any}
      scanHistory={history}
      isOperator={false}
      canDispatch={false}
      demoMode
    />
  );
}
