// Server component: load the project on the server (RLS-protected),
// then mount the client-side workspace UI.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProjectBySlug, getRecentRuns, getScanHistory } from '@/lib/workspace';
import WorkspaceClient from './workspace-client';

interface PageProps {
  params: { orgSlug: string; projectSlug: string };
}

export default async function WorkspacePage({ params }: PageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=' + encodeURIComponent(`/workspace/${params.orgSlug}/${params.projectSlug}`));
  }

  const projectAndOrg = await getProjectBySlug(params.orgSlug, params.projectSlug);
  if (!projectAndOrg) {
    return (
      <div className="min-h-screen bg-canvas text-ink flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-semibold">Project not found</h1>
          <p className="text-sm text-dim">
            Either <code className="text-dim">{params.orgSlug}/{params.projectSlug}</code> doesn&apos;t exist,
            or your account doesn&apos;t have access. If you think this is wrong, contact your org admin.
          </p>
          <a href="/" className="inline-block text-sm text-brand hover:underline">← Back home</a>
        </div>
      </div>
    );
  }

  const recentRuns = await getRecentRuns(projectAndOrg.project.id, 25);
  const scanHistory = await getScanHistory(projectAndOrg.project.id);

  // White-label inheritance: an end-client org under a branded channel (e.g.
  // 觀瀾智庫) shows the CHANNEL's platform name. Resolved server-side so the
  // client component just reads organization.metadata.branding.
  const orgMeta: any = projectAndOrg.organization.metadata || {};
  if (!orgMeta.branding?.platformName && projectAndOrg.organization.parent_org_id) {
    const { data: parent } = await supabase
      .from('organizations')
      .select('metadata')
      .eq('id', projectAndOrg.organization.parent_org_id)
      .maybeSingle();
    const parentBranding = (parent?.metadata as any)?.branding;
    if (parentBranding?.platformName) {
      (projectAndOrg.organization as any).metadata = { ...orgMeta, branding: parentBranding };
    }
  }

  // Operators (members of the MemeCMO root org) may open the raw execution
  // trace; clients see the curated progress view only.
  const { data: rootOrg } = await supabase.from('organizations').select('id').eq('type', 'root').maybeSingle();
  let isOperator = false;
  if (rootOrg) {
    const { data: mem } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', rootOrg.id)
      .eq('user_id', user.id)
      .maybeSingle();
    isOperator = !!mem;
  }

  // Mirrors RLS can_dispatch_runs(): operators, org admins/editors and parent
  // channel-partner admins/editors may trigger runs; viewers browse only. The
  // UI hides every Run control when this is false — a blank panel with a Run
  // button was nudging read-only users into credit-priced manual scans.
  let canDispatch = isOperator;
  if (!canDispatch) {
    const { data: pm } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', projectAndOrg.organization.id)
      .eq('user_id', user.id)
      .maybeSingle();
    canDispatch = pm?.role === 'admin' || pm?.role === 'editor';
  }
  const parentOrgId = (projectAndOrg.organization as any).parent_org_id;
  if (!canDispatch && parentOrgId) {
    const { data: ppm } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', parentOrgId)
      .eq('user_id', user.id)
      .maybeSingle();
    canDispatch = ppm?.role === 'admin' || ppm?.role === 'editor';
  }

  return (
    <WorkspaceClient
      project={projectAndOrg.project}
      organization={projectAndOrg.organization}
      initialRuns={recentRuns}
      scanHistory={scanHistory}
      isOperator={isOperator}
      canDispatch={canDispatch}
    />
  );
}
