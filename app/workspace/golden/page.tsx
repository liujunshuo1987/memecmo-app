// Operator-only labelling page for the golden evaluation set.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isOperator } from '@/lib/org-auth';
import GoldenClient from './golden-client';

export const dynamic = 'force-dynamic';

export default async function GoldenPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=' + encodeURIComponent('/workspace/golden'));
  if (!(await isOperator(supabase, user.id))) redirect('/dashboard');
  return <GoldenClient labeler={user.email ?? user.id} />;
}
