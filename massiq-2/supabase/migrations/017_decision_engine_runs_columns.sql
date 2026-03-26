-- =============================================================================
-- Migration 017: Align decision_engine_runs with app (input_summary / output_json)
-- =============================================================================
-- Live DBs may have been created before 016 included all columns — ALTER adds missing.

ALTER TABLE public.decision_engine_runs
  ADD COLUMN IF NOT EXISTS input_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.decision_engine_runs
  ADD COLUMN IF NOT EXISTS output_json jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.decision_engine_runs.input_summary IS 'Engine input snapshot (adherence, etc.)';
COMMENT ON COLUMN public.decision_engine_runs.output_json IS 'Full MassIQPersonalizationDecision JSON';
