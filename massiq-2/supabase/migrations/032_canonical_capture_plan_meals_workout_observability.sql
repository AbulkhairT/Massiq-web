-- Canonical tables for scan capture, plan weeks, normalized meal/workout rows,
-- symmetry corrections, and product analytics. Safe for fresh installs; if your
-- project already created these tables in the dashboard, this migration is a no-op
-- when objects already exist (adjust manually if column names differ).

-- scan_capture_sessions
CREATE TABLE IF NOT EXISTS public.scan_capture_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  scan_asset_id uuid,
  platform text NOT NULL DEFAULT 'web',
  capture_mode text NOT NULL DEFAULT 'manual',
  app_version text,
  status text NOT NULL DEFAULT 'in_progress',
  pose_sequence jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_capture_sessions_user_id_idx ON public.scan_capture_sessions (user_id);
CREATE INDEX IF NOT EXISTS scan_capture_sessions_scan_id_idx ON public.scan_capture_sessions (scan_id);

-- scan_capture_events
CREATE TABLE IF NOT EXISTS public.scan_capture_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.scan_capture_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_capture_events_session_id_idx ON public.scan_capture_events (session_id);

-- scan_quality_reviews
CREATE TABLE IF NOT EXISTS public.scan_quality_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  confidence_label text,
  recommendation text,
  notes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_quality_reviews_user_id_idx ON public.scan_quality_reviews (user_id);

-- plan_weeks (continuity per program week within a plan)
CREATE TABLE IF NOT EXISTS public.plan_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  week_number int NOT NULL CHECK (week_number >= 1 AND week_number <= 52),
  week_start_date date,
  phase text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, week_number)
);
CREATE INDEX IF NOT EXISTS plan_weeks_plan_id_idx ON public.plan_weeks (plan_id);

-- meal_plan_days / meal_plan_items
CREATE TABLE IF NOT EXISTS public.meal_plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id uuid NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  day_index int NOT NULL CHECK (day_index >= 0),
  day_label text,
  plan_date date,
  totals jsonb DEFAULT '{}'::jsonb,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meal_plan_id, day_index)
);
CREATE INDEX IF NOT EXISTS meal_plan_days_meal_plan_id_idx ON public.meal_plan_days (meal_plan_id);

CREATE TABLE IF NOT EXISTS public.meal_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_day_id uuid NOT NULL REFERENCES public.meal_plan_days(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  slot_key text,
  name text,
  calories int,
  protein_g int,
  carbs_g int,
  fat_g int,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meal_plan_items_day_id_idx ON public.meal_plan_items (meal_plan_day_id);

-- workout_program_days / workout_program_exercises
CREATE TABLE IF NOT EXISTS public.workout_program_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_program_id uuid NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
  day_index int NOT NULL CHECK (day_index >= 0),
  day_label text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workout_program_id, day_index)
);
CREATE INDEX IF NOT EXISTS workout_program_days_program_id_idx ON public.workout_program_days (workout_program_id);

CREATE TABLE IF NOT EXISTS public.workout_program_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_program_day_id uuid NOT NULL REFERENCES public.workout_program_days(id) ON DELETE CASCADE,
  exercise_index int NOT NULL DEFAULT 0,
  name text,
  sets int,
  reps text,
  rest text,
  weight text,
  technique text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workout_program_exercises_day_id_idx ON public.workout_program_exercises (workout_program_day_id);

-- symmetry_corrections
CREATE TABLE IF NOT EXISTS public.symmetry_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  area text,
  action text,
  source text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS symmetry_corrections_user_id_idx ON public.symmetry_corrections (user_id);

-- product_events (analytics; no PII in payload)
CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_events_user_id_idx ON public.product_events (user_id);
CREATE INDEX IF NOT EXISTS product_events_event_name_idx ON public.product_events (event_name);
