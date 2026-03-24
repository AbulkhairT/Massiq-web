-- =============================================================================
-- Migration 009: billing_events table (webhook audit log)
-- =============================================================================
-- Stores Stripe webhook events for audit and debugging.
-- Populated by /api/stripe/webhook handler.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.billing_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  data       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_events_created_idx ON public.billing_events (created_at DESC);

-- No RLS or service role only; webhook uses service role
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
