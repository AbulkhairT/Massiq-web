-- =============================================================================
-- Migration 002: Create public.subscriptions table
-- =============================================================================
-- This table is kept in sync by the Stripe webhook handler (server-side only).
-- No client writes are allowed — only the service role via webhook events.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id     text,
  stripe_subscription_id text        UNIQUE,
  status                 text        NOT NULL DEFAULT 'inactive',
    -- Values: active | trialing | past_due | canceled | unpaid | incomplete | inactive
  price_id               text,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean     NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup by user (most common read path)
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id);

-- Lookup by Stripe customer (webhook reconciliation when metadata is missing)
CREATE INDEX IF NOT EXISTS subscriptions_customer_id_idx ON public.subscriptions (stripe_customer_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscription
DROP POLICY IF EXISTS "users_read_own_subscription" ON public.subscriptions;
CREATE POLICY "users_read_own_subscription"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- NO client INSERT/UPDATE/DELETE policies — all writes happen via service role
-- (the Stripe webhook handler uses SUPABASE_SERVICE_ROLE_KEY and bypasses RLS)

-- =============================================================================
-- No manual Supabase steps required for this migration.
-- Run via: Supabase SQL Editor → paste and execute.
-- =============================================================================
