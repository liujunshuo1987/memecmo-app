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

  return (
    <WorkspaceClient
      project={projectAndOrg.project}
      organization={projectAndOrg.organization}
      initialRuns={recentRuns}
      scanHistory={scanHistory}
      isOperator={isOperator}
    />
  );
}
