-- =============================================================================
-- Migration 005: Food scan tracking in user_entitlements
-- =============================================================================
-- Adds free_food_scans_used to enforce 2 free food scans per user (lifetime).
-- Premium users bypass this; free users are limited at the DB level.
-- Incremented by the /api/food-scan route (server-side) after successful scan.
-- =============================================================================

ALTER TABLE public.user_entitlements
  ADD COLUMN IF NOT EXISTS free_food_scans_used integer NOT NULL DEFAULT 0;

-- RPC: Atomically check and increment food scan count. Returns allowed + new count.
-- Called by /api/food-scan with service role. Limit enforced in DB.
CREATE OR REPLACE FUNCTION public.allocate_food_scan(p_user_id uuid, p_limit integer DEFAULT 2)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
  v_new integer;
BEGIN
  INSERT INTO public.user_entitlements (user_id, free_food_scans_used)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_entitlements
  SET free_food_scans_used = free_food_scans_used + 1,
      updated_at = now()
  WHERE user_id = p_user_id
    AND free_food_scans_used < p_limit
  RETURNING free_food_scans_used INTO v_new;

  IF v_new IS NULL THEN
    SELECT free_food_scans_used INTO v_used FROM public.user_entitlements WHERE user_id = p_user_id;
    RETURN jsonb_build_object('allowed', false, 'used', COALESCE(v_used, 0));
  END IF;
  RETURN jsonb_build_object('allowed', true, 'used', v_new);
END;
$$;

-- =============================================================================
-- Notes
-- =============================================================================
-- • allocate_food_scan atomically increments if used < limit.
-- • Called BEFORE Claude by /api/food-scan. Slot consumed even if Claude fails.
-- • Returns { allowed: true, used: n } or { allowed: false, used: n }.
-- =============================================================================
