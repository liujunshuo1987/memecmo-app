-- Per-model token usage on each run. The bots we run are priced up to 15x
-- apart, so tokens_in/tokens_out alone cannot be turned into a cost.
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS usage_by_model JSONB;
