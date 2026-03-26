-- decision_engine_runs: input_snapshot + output_snapshot (required by API; match app inserts)

ALTER TABLE public.decision_engine_runs
  ADD COLUMN IF NOT EXISTS input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.decision_engine_runs
  ADD COLUMN IF NOT EXISTS output_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.decision_engine_runs
SET input_snapshot = input_summary
WHERE input_snapshot = '{}'::jsonb
  AND input_summary IS NOT NULL
  AND input_summary <> '{}'::jsonb;

UPDATE public.decision_engine_runs
SET output_snapshot = output_json
WHERE output_snapshot = '{}'::jsonb
  AND output_json IS NOT NULL
  AND output_json <> '{}'::jsonb;
