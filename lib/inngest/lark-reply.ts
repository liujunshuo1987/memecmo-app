// Posts a MemeCMO answer under a question the group @-ed to the bot.
// Kept out of functions.ts so the Lark answer path can ship on its own; it is
// registered next to `functions` in app/api/inngest/route.ts.
//
// Trigger: event 'lark/reply.requested' { rowId, text, approvedBy } — sent by an
// operator after a person has read and approved the text. No retries: a retry
// after a slow Lark response would post the answer twice.

import { inngest } from '@/lib/inngest/client';
import { serviceClient } from '@/lib/commerce';
import { postOperatorAnswer } from '@/lib/lark-bot';

export const larkOperatorReply = inngest.createFunction(
  { id: 'lark-operator-reply', name: 'Post a MemeCMO answer under a Lark question', retries: 0, triggers: [{ event: 'lark/reply.requested' }] },
  async ({ event, step }) => {
    const d = ((event as any)?.data ?? {}) as { rowId?: string; text?: string; approvedBy?: string };
    return step.run('post', () => postOperatorAnswer(serviceClient(), { rowId: String(d.rowId ?? ''), text: String(d.text ?? ''), approvedBy: String(d.approvedBy ?? '') }));
  },
);
