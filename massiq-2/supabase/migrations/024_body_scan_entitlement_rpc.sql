-- =============================================================================
-- Body scan entitlements: explicit RPC increment (reliable vs. trigger-only).
-- Drops legacy AFTER INSERT trigger to avoid double-counting once the app calls
-- apply_body_scan_entitlement after each successful non-duplicate scan insert.
-- =============================================================================

-- Remove legacy trigger + function (client now applies entitlement via RPC)
DROP TRIGGER IF EXISTS after_scan_insert ON public.scans;
DROP FUNCTION IF EXISTS public.increment_scan_entitlement();

-- After a successful scans INSERT, app calls this with the new scan id.
CREATE OR REPLACE FUNCTION public.apply_body_scan_entitlement(p_scan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     uuid := auth.uid();
  st      text;
  dup_id  uuid;
  c_used  int;
  c_limit int;
  c_life  int;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT COALESCE(s.scan_status, 'complete'), s.duplicate_of_scan_id
  INTO st, dup_id
  FROM public.scans s
  WHERE s.id = p_scan_id AND s.user_id = uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'scan_not_found');
  END IF;

  INSERT INTO public.user_entitlements (user_id, free_scans_used, free_scan_limit, lifetime_scan_count)
  VALUES (uid, 0, 2, 0)
  ON CONFLICT (user_id) DO NOTHING;

  IF st = 'duplicate' OR dup_id IS NOT NULL THEN
    SELECT ue.free_scans_used, ue.free_scan_limit, ue.lifetime_scan_count
    INTO c_used, c_limit, c_life
    FROM public.user_entitlements ue
    WHERE ue.user_id = uid;
    RETURN jsonb_build_object(
      'ok', true,
      'increment_applied', false,
      'reason', 'duplicate_skip',
      'free_scans_used', COALESCE(c_used, 0),
      'free_scan_limit', COALESCE(c_limit, 2),
      'lifetime_scan_count', COALESCE(c_life, 0)
    );
  END IF;

  INSERT INTO public.user_entitlements (user_id, free_scans_used, lifetime_scan_count)
  VALUES (uid, 1, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    free_scans_used     = public.user_entitlements.free_scans_used + 1,
    lifetime_scan_count = public.user_entitlements.lifetime_scan_count + 1,
    updated_at          = now();

  SELECT ue.free_scans_used, ue.free_scan_limit, ue.lifetime_scan_count
  INTO c_used, c_limit, c_life
  FROM public.user_entitlements ue
  WHERE ue.user_id = uid;

  RETURN jsonb_build_object(
    'ok', true,
    'increment_applied', true,
    'reason', 'new_scan',
    'free_scans_used', COALESCE(c_used, 0),
    'free_scan_limit', COALESCE(c_limit, 2),
    'lifetime_scan_count', COALESCE(c_life, 0)
  );
END;
$$;

-- One-shot reconcile when scan rows exist but entitlements row was missing or drifted.
CREATE OR REPLACE FUNCTION public.reconcile_body_scan_entitlements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n   int;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT COUNT(*)::int
  INTO n
  FROM public.scans
  WHERE user_id = uid
    AND COALESCE(scan_status, 'complete') <> 'duplicate'
    AND duplicate_of_scan_id IS NULL;

  INSERT INTO public.user_entitlements (user_id, free_scans_used, lifetime_scan_count, free_scan_limit)
  VALUES (uid, n, n, 2)
  ON CONFLICT (user_id) DO UPDATE SET
    free_scans_used     = EXCLUDED.free_scans_used,
    lifetime_scan_count = GREATEST(public.user_entitlements.lifetime_scan_count, EXCLUDED.lifetime_scan_count),
    updated_at          = now();

  RETURN jsonb_build_object('ok', true, 'reconciled_non_duplicate_scans', n);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_body_scan_entitlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_body_scan_entitlements() TO authenticated;
