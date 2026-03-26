-- BEFORE INSERT on scans: enforce free body-scan cap for non-premium users (DB source of truth).
-- Uses FOR UPDATE on user_entitlements so concurrent inserts cannot both pass when at limit-1.
-- Premium (active/trialing subscription) bypasses. Duplicate scan_status rows skip this check
-- (app normally does not insert duplicates; trigger 003 still handles lifetime-only bump if they do).

CREATE OR REPLACE FUNCTION public.enforce_body_scan_entitlement_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_premium boolean;
  v_used    integer;
  v_limit   integer;
BEGIN
  IF COALESCE(NEW.scan_status, 'complete') = 'duplicate' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = NEW.user_id
      AND s.status IN ('active', 'trialing')
  )
  INTO v_premium;

  IF v_premium THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_entitlements (user_id, free_scans_used, free_scan_limit, lifetime_scan_count)
  VALUES (NEW.user_id, 0, 2, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT ue.free_scans_used, ue.free_scan_limit
  INTO v_used, v_limit
  FROM public.user_entitlements ue
  WHERE ue.user_id = NEW.user_id
  FOR UPDATE;

  v_used := COALESCE(v_used, 0);
  v_limit := COALESCE(v_limit, 2);

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'body_scan_free_limit_reached'
      USING ERRCODE = 'P0001',
            HINT = 'Free body scan limit reached for this account';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_scan_insert_enforce_entitlements ON public.scans;

CREATE TRIGGER before_scan_insert_enforce_entitlements
  BEFORE INSERT ON public.scans
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_body_scan_entitlement_before_insert();
