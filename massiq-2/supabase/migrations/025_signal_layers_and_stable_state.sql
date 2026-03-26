-- =============================================================================
-- Migration 025: Signal layers + stabilized body state
-- =============================================================================

-- 1) scan_signal_sets ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scan_signal_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scan_id uuid NOT NULL UNIQUE REFERENCES public.scans(id) ON DELETE CASCADE,

  body_fat_low numeric,
  body_fat_high numeric,
  ab_definition_score integer,
  waist_definition_score integer,
  chest_score integer,
  upper_chest_score integer,
  shoulders_score integer,
  arms_score integer,
  back_v_taper_score integer,
  symmetry_score integer,

  lighting_quality_score integer,
  pose_quality_score integer,
  framing_quality_score integer,
  mirror_distortion_risk_score integer,
  flex_bias_score integer,

  limiting_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  signal_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_label text,
  confidence_score numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scan_signal_sets_user_idx
  ON public.scan_signal_sets (user_id, created_at DESC);

-- 2) user_body_state ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_body_state (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  based_on_scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  previous_scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,

  stable_body_fat_low numeric,
  stable_body_fat_high numeric,
  stable_lean_mass_kg numeric,

  stable_ab_definition_score integer,
  stable_waist_definition_score integer,
  stable_chest_score integer,
  stable_upper_chest_score integer,
  stable_shoulders_score integer,
  stable_arms_score integer,
  stable_symmetry_score integer,

  primary_limiting_factor text,
  secondary_limiting_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  phase_recommendation text,
  state_confidence_label text,
  state_confidence_score numeric,
  last_meaningful_change_at timestamptz,
  stabilization_notes text,
  state_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_body_state_updated_idx
  ON public.user_body_state (updated_at DESC);

-- 3) food_signal_sets ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_signal_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  food_log_id uuid REFERENCES public.food_logs(id) ON DELETE SET NULL,
  food_scan_event_id uuid REFERENCES public.food_scan_events(id) ON DELETE SET NULL,

  identified_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  canonical_matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  portion_estimates jsonb NOT NULL DEFAULT '[]'::jsonb,

  estimated_calories_low integer,
  estimated_calories_high integer,
  estimated_protein_low integer,
  estimated_protein_high integer,
  estimated_carbs_low integer,
  estimated_carbs_high integer,
  estimated_fat_low integer,
  estimated_fat_high integer,

  ambiguity_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_label text,
  confidence_score numeric,
  signal_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS food_signal_sets_user_idx
  ON public.food_signal_sets (user_id, created_at DESC);

-- 4) RLS ----------------------------------------------------------------------
ALTER TABLE public.scan_signal_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_body_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_signal_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scan_signal_sets_select_own" ON public.scan_signal_sets;
CREATE POLICY "scan_signal_sets_select_own"
  ON public.scan_signal_sets FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "scan_signal_sets_insert_own" ON public.scan_signal_sets;
CREATE POLICY "scan_signal_sets_insert_own"
  ON public.scan_signal_sets FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_body_state_select_own" ON public.user_body_state;
CREATE POLICY "user_body_state_select_own"
  ON public.user_body_state FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "user_body_state_upsert_own" ON public.user_body_state;
CREATE POLICY "user_body_state_upsert_own"
  ON public.user_body_state FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "user_body_state_update_own" ON public.user_body_state;
CREATE POLICY "user_body_state_update_own"
  ON public.user_body_state FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "food_signal_sets_select_own" ON public.food_signal_sets;
CREATE POLICY "food_signal_sets_select_own"
  ON public.food_signal_sets FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "food_signal_sets_insert_own" ON public.food_signal_sets;
CREATE POLICY "food_signal_sets_insert_own"
  ON public.food_signal_sets FOR INSERT WITH CHECK (user_id = auth.uid());
