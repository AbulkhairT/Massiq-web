-- =============================================================================
-- Migration 011: billing_events RLS policy
-- =============================================================================
-- Ensure service role can insert (webhook). RLS already enabled in 009.
-- Service role typically bypasses RLS; this policy is for explicitness.
-- =============================================================================

DROP POLICY IF EXISTS "service_role_all_billing_events" ON public.billing_events;
CREATE POLICY "service_role_all_billing_events"
  ON public.billing_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
