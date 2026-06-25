// Inngest client — durable background execution for agent runs.
//
// Why Inngest: agent work must run independently of any browser/HTTP request
// (scheduled monitoring, 10-minute multi-engine runs, weekly reports). Inngest
// invokes our /api/inngest endpoint server-to-server, with retries and
// step-level durability, so a run survives client disconnects and function
// cold-starts.

import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'memecmo-app',
  // In production, INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY are set via the
  // Inngest↔Vercel integration. Locally, the Inngest dev server needs no keys.
});

// ─── Event catalog ───────────────────────────────────────────────────────────
export type AgentRunRequested = {
  name: 'agent/run.requested';
  data: {
    runId: string;
    agentId: string;
    projectId: string;
  };
};

export type Events = {
  'agent/run.requested': AgentRunRequested;
};
