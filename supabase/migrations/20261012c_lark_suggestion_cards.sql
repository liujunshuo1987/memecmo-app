-- One living suggestion card per project in its Lark group (founder, 2026-10-12:
-- "发卡不刷屏"). New pages merge into the current card by updating it in place;
-- a new card starts only when the old one is finished or 7 days old; one text
-- notice per week at most; a ⏰ header at 14 days; retired at 30 days.
CREATE TABLE IF NOT EXISTS public.lark_suggestion_cards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  chat_id        TEXT NOT NULL,
  message_id     TEXT NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notice_sent_at TIMESTAMPTZ,          -- the last one-line "N new pages ↑" reply (≥ 6 days apart)
  reminded_at    TIMESTAMPTZ,          -- the one ⏰ header change at 14 days
  retired_at     TIMESTAMPTZ,          -- deleted / archived at 30 days, or finished
  created_by     TEXT
);
CREATE INDEX IF NOT EXISTS lark_suggestion_cards_project_idx ON public.lark_suggestion_cards (project_id, created_at DESC);
ALTER TABLE public.lark_suggestion_cards ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.lark_suggestion_cards TO service_role;

-- The card already posted to FMVN's group on 2026-10-12 becomes its living card;
-- that post counts as this week's notice.
INSERT INTO public.lark_suggestion_cards (project_id, chat_id, message_id, created_by, notice_sent_at)
SELECT 'f8f77dd4-a9ee-4828-8de1-2f317ad88392', 'oc_19fafd4e661b4c01b22d6c56d87a0df4', 'om_x100b63fc1c7b80a8e10b70e77d1a46e', 'liujunshuo1987@gmail.com', now()
WHERE EXISTS (SELECT 1 FROM public.projects WHERE id = 'f8f77dd4-a9ee-4828-8de1-2f317ad88392')
ON CONFLICT (message_id) DO NOTHING;
