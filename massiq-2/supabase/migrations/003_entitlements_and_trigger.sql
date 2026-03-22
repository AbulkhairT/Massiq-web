-- =============================================================================
-- Migration 003: user_entitlements + scan insert trigger
-- =============================================================================
-- Persistent entitlement tracking decoupled from scan history.
-- Free scan eligibility is based on lifetime count, NOT current scan count,
-- so deleting scan history cannot restore free scan access.
-- =============================================================================

-- ─── 1. user_entitlements table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_entitlements (
  user_id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  free_scans_used     integer     NOT NULL DEFAULT 0,
  free_scan_limit     integer     NOT NULL DEFAULT 2,
  lifetime_scan_count integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can only read their own entitlement row
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_entitlements" ON public.user_entitlements;
CREATE POLICY "users_read_own_entitlements"
  ON public.user_entitlements FOR SELECT
  USING (user_id = auth.uid());

-- NO client INSERT/UPDATE/DELETE — all mutations are performed by the trigger
-- (SECURITY DEFINER function bypasses RLS).

-- ─── 2. Trigger function: increment on scan insert ────────────────────────────
-- Fires AFTER INSERT on scans.
-- Non-duplicate scans increment both free_scans_used and lifetime_scan_count.
-- Duplicate scans increment only lifetime_scan_count.
-- Deleting scans does NOT decrement either counter — by design.

CREATE OR REPLACE FUNCTION increment_scan_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER           -- runs as the function owner, bypasses RLS
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.scan_status, 'complete') <> 'duplicate' THEN
    -- Real scan: increment both counters
    INSERT INTO public.user_entitlements (user_id, free_scans_used, lifetime_scan_count)
    VALUES (NEW.user_id, 1, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET free_scans_used     = public.user_entitlements.free_scans_used + 1,
          lifetime_scan_count = public.user_entitlements.lifetime_scan_count + 1,
          updated_at          = now();
  ELSE
    -- Duplicate scan: only count toward lifetime total (no free usage deducted)
    INSERT INTO public.user_entitlements (user_id, lifetime_scan_count)
    VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET lifetime_scan_count = public.user_entitlements.lifetime_scan_count + 1,
          updated_at          = now();
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger first if it already exists (safe to re-run)
DROP TRIGGER IF EXISTS after_scan_insert ON public.scans;

CREATE TRIGGER after_scan_insert
  AFTER INSERT ON public.scans
  FOR EACH ROW
  EXECUTE FUNCTION increment_scan_entitlement();

-- ─── 3. Index ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS user_entitlements_user_id_idx
  ON public.user_entitlements (user_id);

-- =============================================================================
-- Notes
-- =============================================================================
-- • free_scans_used only ever goes up — DELETE on scans has no effect.
-- • To grant a user more free scans, update free_scan_limit via admin/service role.
-- • Premium users bypass this table entirely (isPremiumActive returns true).
-- • On account deletion, the cascade on auth.users drops this row automatically.
-- =============================================================================
