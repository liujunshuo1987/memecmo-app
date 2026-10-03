-- MemeCMO's answer to a question the group @-ed to the bot. The bot only
-- acknowledges a question; the substantive answer is written by MemeCMO,
-- approved by a named person, and posted under the question through the bot.
-- answered_at also tells which questions are still open.

ALTER TABLE public.lark_messages ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;
ALTER TABLE public.lark_messages ADD COLUMN IF NOT EXISTS answer      JSONB;   -- {reply_id, text, approved_by, sent_at}
