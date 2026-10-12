-- Suggested actions as interactive Lark cards (2026-10-12, founder: "把建议行动
-- 推到 Lark 群，让确认变成一键"). A click on the card confirms or dismisses one
-- suggestion under the clicker's own account; the card is re-rendered for the
-- whole group from the rows that were posted on it, so we keep the card's
-- message id on each row.
ALTER TABLE public.intervention_suggestions ADD COLUMN IF NOT EXISTS lark_message_id TEXT;
CREATE INDEX IF NOT EXISTS intervention_suggestions_lark_msg_idx ON public.intervention_suggestions (lark_message_id) WHERE lark_message_id IS NOT NULL;
