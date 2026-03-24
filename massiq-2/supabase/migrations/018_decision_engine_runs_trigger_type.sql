-- =============================================================================
-- Migration 018: decision_engine_runs.trigger_type (NOT NULL)
-- =============================================================================
-- Production may already have this column; IF NOT EXISTS keeps apply idempotent.

ALTER TABLE public.decision_engine_runs
  ADD COLUMN IF NOT EXISTS trigger_type text NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN public.decision_engine_runs.trigger_type IS
  'Why this run was written, e.g. post_scan_apply, probe';
