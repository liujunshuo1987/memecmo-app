-- Diagnostic scans (manual, partial engine set) and run options.
--
-- Policy stays: nothing partial is ever scored into the trend. But when an
-- engine is down and the operator or client wants to see the brand's AI
-- answers TODAY (site relaunch, campaign), a clearly-labelled diagnostic on
-- the remaining engines is more useful than a failed run. It gets its own
-- trigger_method so every trend/digest/rollup reader can exclude it with one
-- predicate, and it never writes to the citation index.
ALTER TABLE public.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_trigger_method_check;
ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_trigger_method_check
  CHECK (trigger_method IN ('chat', 'schedule', 'api', 'cascade', 'preview', 'diagnostic'));
-- Per-run options supplied by the caller (e.g. {"engineKeys": [...]}).
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS options JSONB;
