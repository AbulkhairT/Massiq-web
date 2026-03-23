-- =============================================================================
-- Migration 006: Food scan limit — 2 per day (was 2 lifetime)
-- =============================================================================
-- Free users get 2 food scans per day. Resets at midnight (server date).
-- Premium users: unlimited.
-- Only successful food scan completions count (API calls record_food_scan_daily).
-- =============================================================================

ALTER TABLE public.user_entitlements
  ADD COLUMN IF NOT EXISTS free_food_scans_date date,
  ADD COLUMN IF NOT EXISTS free_food_scans_used_today integer NOT NULL DEFAULT 0;

-- RPC: Get food scans used today. Returns 0 if date changed or never set.
CREATE OR REPLACE FUNCTION public.get_food_scan_used_today(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date;
  v_used integer;
BEGIN
  SELECT free_food_scans_date, free_food_scans_used_today
  INTO v_date, v_used
  FROM public.user_entitlements
  WHERE user_id = p_user_id;

  IF v_date IS NULL OR v_date < current_date THEN
    RETURN 0;
  END IF;
  RETURN COALESCE(v_used, 0);
END;
$$;

-- RPC: Increment today's count. Resets to 1 if new day.
CREATE OR REPLACE FUNCTION public.record_food_scan_daily(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_entitlements (user_id, free_food_scans_date, free_food_scans_used_today)
  VALUES (p_user_id, current_date, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET
    free_food_scans_date   = current_date,
    free_food_scans_used_today = CASE
      WHEN public.user_entitlements.free_food_scans_date IS NULL
        OR public.user_entitlements.free_food_scans_date < current_date
      THEN 1
      ELSE public.user_entitlements.free_food_scans_used_today + 1
    END,
    updated_at = now();
END;
$$;

-- =============================================================================
-- Notes
-- =============================================================================
-- • free_food_scans_used (lifetime) is deprecated for enforcement; kept for legacy.
-- • get_food_scan_used_today: read-only, for limit check before scan.
-- • record_food_scan_daily: call ONLY after successful food scan (valid food JSON).
-- =============================================================================
