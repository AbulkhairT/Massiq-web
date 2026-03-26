-- =============================================================================
-- Migration 012: Subscription schema hardening
-- =============================================================================
-- Adds missing optional columns, removes CHECK constraints that block valid
-- Stripe statuses, and ensures migration 007's uniqueness indexes exist.
--
-- SAFE TO RUN MULTIPLE TIMES (all statements are idempotent).
-- Run via: Supabase SQL Editor → paste and execute.
-- =============================================================================

-- ── 1. Ensure migration 007 uniqueness indexes exist ─────────────────────────
--
-- The webhook and verify-session use ON CONFLICT on user_id for atomic upserts.
-- Without this index the ON CONFLICT falls back to SELECT→PATCH/POST (still works
-- but not race-safe). The stripe_subscription_id index prevents duplicates
-- from concurrent inserts of the same Stripe subscription.

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_unique_idx
  ON public.subscriptions (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_unique_idx
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ── 2. Add optional columns if they don't exist ──────────────────────────────
--
-- These columns are referenced in the app's schema description but were not
-- created in migration 002. Adding them as nullable means existing rows are
-- unaffected and the webhook can omit them without causing write failures.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_type    text,
  ADD COLUMN IF NOT EXISTS provider     text DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS canceled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- ── 3. Remove any CHECK constraint on status that blocks valid Stripe statuses ─
--
-- Stripe can return: active, trialing, past_due, canceled, unpaid, incomplete,
-- incomplete_expired. Any CHECK constraint that doesn't include all of these
-- will cause subscription writes to fail silently.
-- We drop known constraint names; if none exist this is a no-op.

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check,
  DROP CONSTRAINT IF EXISTS subscriptions_status_check1,
  DROP CONSTRAINT IF EXISTS check_subscription_status,
  DROP CONSTRAINT IF EXISTS subscription_status_check;

-- ── 4. Backfill provider = 'stripe' for existing rows ────────────────────────
--
-- The webhook now writes provider='stripe' on all new rows.
-- Backfill existing rows so the column is consistent.

UPDATE public.subscriptions
   SET provider = 'stripe'
 WHERE provider IS NULL;

-- ── 5. Index on provider for future multi-provider lookups ───────────────────

CREATE INDEX IF NOT EXISTS subscriptions_provider_idx
  ON public.subscriptions (provider);

-- ── 6. Confirm billing_events idempotency index exists (migration 010) ───────

ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS stripe_event_id text,
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_stripe_event_id_key
  ON public.billing_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- =============================================================================
-- After running this migration the following guarantees hold:
--
--   • Exactly one subscription row per user (subscriptions_user_id_unique_idx)
--   • Exactly one row per Stripe subscription ID (stripe_subscription_id unique)
--   • Any Stripe status value can be written without DB constraint errors
--   • billing_events idempotency index exists (prevents double-processing)
--   • provider column exists for all rows (backfilled to 'stripe')
-- =============================================================================
