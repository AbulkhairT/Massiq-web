-- =============================================================================
-- Migration 007: Canonical subscriptions row per user
-- =============================================================================
-- Ensures one current subscription row per user_id.
-- Removes existing duplicates first, then adds uniqueness.
-- =============================================================================

WITH ranked AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.subscriptions
)
DELETE FROM public.subscriptions s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_unique_idx
  ON public.subscriptions (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_unique_idx
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
