-- Guided iOS capture: aggregate quality fields, event user_id, quality review taxonomy.
-- Safe to run on existing projects (IF NOT EXISTS).

ALTER TABLE public.scan_capture_sessions
  ADD COLUMN IF NOT EXISTS device_type text;

ALTER TABLE public.scan_capture_sessions
  ADD COLUMN IF NOT EXISTS lighting_score double precision;

ALTER TABLE public.scan_capture_sessions
  ADD COLUMN IF NOT EXISTS alignment_score double precision;

ALTER TABLE public.scan_capture_sessions
  ADD COLUMN IF NOT EXISTS framing_score double precision;

ALTER TABLE public.scan_capture_sessions
  ADD COLUMN IF NOT EXISTS distance_score double precision;

ALTER TABLE public.scan_capture_sessions
  ADD COLUMN IF NOT EXISTS stability_score double precision;

ALTER TABLE public.scan_capture_sessions
  ADD COLUMN IF NOT EXISTS quality_passed boolean;

ALTER TABLE public.scan_capture_sessions
  ADD COLUMN IF NOT EXISTS failure_reason text;

ALTER TABLE public.scan_capture_events
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS scan_capture_events_user_id_idx ON public.scan_capture_events (user_id);

ALTER TABLE public.scan_quality_reviews
  ADD COLUMN IF NOT EXISTS review_source text;

ALTER TABLE public.scan_quality_reviews
  ADD COLUMN IF NOT EXISTS quality_bucket text;

ALTER TABLE public.scan_quality_reviews
  ADD COLUMN IF NOT EXISTS reasons jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.scan_quality_reviews
  ADD COLUMN IF NOT EXISTS recommended_action text;
