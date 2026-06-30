// Invitation accept page. A person clicks the invite link → lands here.
//  - Not logged in → prompt to sign in with the invited email.
//  - Logged in, email matches → one-click Accept (joins the org).
//  - Logged in, wrong email → tells them which account to use.

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/commerce';
import AcceptButton from './accept-button';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: { token: string } }) {
  const sb = serviceClient();
  const { data: invite } = await sb
    .from('organization_invitations')
    .select('email, role, status, expires_at, organization_id')
    .eq('token', params.token)
    .maybeSingle();

  let orgName = '';
  if (invite) {
    const { data: org } = await sb.from('organizations').select('name').eq('id', invite.organization_id).maybeSingle();
    orgName = org?.name ?? '';
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const expired = invite ? new Date(invite.expires_at).getTime() < Date.now() : false;
  const valid = invite && invite.status === 'pending' && !expired;
  const emailMatches = !!user && !!invite && (user.email ?? '').toLowerCase() === invite.email.toLowerCase();

  return (
    <main className="min-h-screen bg-canvas text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-surface p-8 shadow-sm">
        <div className="text-sm text-muted">MemeCMO · GEO</div>
        {!invite && <h1 className="mt-3 text-xl font-semibold">Invitation not found</h1>}

        {invite && !valid && (
          <>
            <h1 className="mt-3 text-xl font-semibold">This invitation is no longer valid</h1>
            <p className="mt-2 text-sm text-muted">{expired ? 'It has expired.' : `Status: ${invite.status}.`} Ask your contact to send a new one.</p>
          </>
        )}

        {invite && valid && (
          <>
            <h1 className="mt-3 text-xl font-semibold">Join {orgName || 'the workspace'}</h1>
            <p className="mt-2 text-sm text-muted">
              You've been invited as <span className="font-medium text-ink">{invite.role}</span>, for{' '}
              <span className="font-medium text-ink">{invite.email}</span>.
            </p>

            {!user && (
              <Link
                href={`/login?next=/invite/${params.token}`}
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-on-brand"
              >
                Sign in to accept
              </Link>
            )}

            {user && emailMatches && <AcceptButton token={params.token} />}

            {user && !emailMatches && (
              <p className="mt-6 rounded-xl border border-edge bg-canvas p-3 text-sm text-muted">
                You're signed in as <span className="text-ink">{user.email}</span>, but this invite is for{' '}
                <span className="text-ink">{invite.email}</span>. Sign out and sign in with that email to accept.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
