-- =============================================================================
-- Migration 010: Add stripe_event_id and user_id to billing_events
-- =============================================================================
-- Enables idempotent webhook processing and better audit/debugging.
-- =============================================================================

ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS stripe_event_id text,
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_stripe_event_id_key
  ON public.billing_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
