-- =============================================================================
-- Migration 008: food_scan_events table + RPCs (source of truth for daily limit)
-- =============================================================================
-- Replaces user_entitlements-based food scan tracking with event-based table.
-- Only successful food photo scans are inserted. used_today / remaining come from here.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.food_scan_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source     text NOT NULL CHECK (source IN ('home', 'nutrition')),
  status     text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'not_food')),
  meal_name  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS food_scan_events_user_created_idx
  ON public.food_scan_events (user_id, created_at DESC);

-- RLS: no client access; service role only (API writes via service role)
ALTER TABLE public.food_scan_events ENABLE ROW LEVEL SECURITY;

-- No policies = no client access (service role bypasses RLS)
-- Optional: allow users to read own for audit
CREATE POLICY "users_read_own_food_scan_events"
  ON public.food_scan_events FOR SELECT
  USING (user_id = auth.uid());

-- RPC: Count successful food scans today for user
CREATE OR REPLACE FUNCTION public.food_scans_used_today(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT count(*)::integer FROM public.food_scan_events
     WHERE user_id = p_user_id AND status = 'success'
       AND created_at::date = current_date),
    0
  );
$$;

-- RPC: 2 - used_today, minimum 0
CREATE OR REPLACE FUNCTION public.food_scans_remaining_today(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(0, 2 - public.food_scans_used_today(p_user_id));
$$;
