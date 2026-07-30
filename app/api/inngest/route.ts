// Inngest serve endpoint. Inngest Cloud calls this URL server-to-server to
// execute functions. The Inngest↔Vercel integration auto-syncs it on deploy.

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { functions } from '@/lib/inngest/functions';

export const runtime = 'nodejs';
// Long agent phases (monitor + accuracy pass) run inside single invocations —
// pin the ceiling explicitly instead of relying on project defaults.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
