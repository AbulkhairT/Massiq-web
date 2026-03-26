-- =============================================================================
-- Migration 031: Minimal replay-table hardening (idempotent, non-destructive)
-- =============================================================================
-- This migration assumes replay tables already exist in DB.
-- It only adds missing columns/indexes needed for replay classification + diffs.

DO $$
BEGIN
  IF to_regclass('public.decision_replay_runs') IS NOT NULL THEN
    ALTER TABLE public.decision_replay_runs
      ADD COLUMN IF NOT EXISTS user_id uuid,
      ADD COLUMN IF NOT EXISTS source_engine_version text,
      ADD COLUMN IF NOT EXISTS replay_engine_version text,
      ADD COLUMN IF NOT EXISTS date_from timestamptz,
      ADD COLUMN IF NOT EXISTS date_to timestamptz,
      ADD COLUMN IF NOT EXISTS total_cases integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS changed_cases integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS improved_cases integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS regressed_cases integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS unchanged_cases integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS summary_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'running',
      ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS completed_at timestamptz;
  END IF;

  IF to_regclass('public.decision_replay_cases') IS NOT NULL THEN
    ALTER TABLE public.decision_replay_cases
      ADD COLUMN IF NOT EXISTS run_id uuid,
      ADD COLUMN IF NOT EXISTS user_id uuid,
      ADD COLUMN IF NOT EXISTS case_key text,
      ADD COLUMN IF NOT EXISTS source_scan_id uuid,
      ADD COLUMN IF NOT EXISTS case_timestamp timestamptz,
      ADD COLUMN IF NOT EXISTS source_engine_version text,
      ADD COLUMN IF NOT EXISTS replay_engine_version text,
      ADD COLUMN IF NOT EXISTS source_input jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS replay_input jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS source_output jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS replay_output jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS diff_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS changed boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'unchanged',
      ADD COLUMN IF NOT EXISTS reason text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS decision_replay_runs_user_started_idx
  ON public.decision_replay_runs (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS decision_replay_cases_run_idx
  ON public.decision_replay_cases (run_id);

CREATE INDEX IF NOT EXISTS decision_replay_cases_user_case_ts_idx
  ON public.decision_replay_cases (user_id, case_timestamp DESC);
