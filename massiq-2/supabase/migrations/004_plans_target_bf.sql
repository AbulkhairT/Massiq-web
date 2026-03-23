-- =============================================================================
-- Migration 004: Add target_bf and start_bf columns to plans table
-- =============================================================================
-- target_bf: the user's target body fat percentage (from AI analysis)
-- start_bf:  the body fat at the time the plan was created (for progress tracking)
-- Both are nullable — plans created before this migration will have NULL values.
-- =============================================================================

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS target_bf numeric,
  ADD COLUMN IF NOT EXISTS start_bf  numeric;

-- =============================================================================
-- Notes
-- =============================================================================
-- • Existing plan rows keep NULL for these columns — the UI falls back to
--   goal-based estimates when NULL (e.g. Cut → startBF - 4).
-- • New plans created after this migration will have both values populated.
-- =============================================================================
