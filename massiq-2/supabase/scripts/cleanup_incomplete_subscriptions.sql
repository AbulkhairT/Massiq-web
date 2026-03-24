-- =============================================================================
-- Cleanup script: Remove bad/incomplete subscription rows
-- =============================================================================
-- Run manually in Supabase SQL Editor to clean up bad test data or production
-- rows left over from incomplete checkouts, repeated taps, or webhook failures.
--
-- Prerequisites:
--   • Migration 007 must be applied (unique index on user_id)
--   • Migration 012 should be applied (schema hardening)
--
-- ALWAYS RUN STEP 0 FIRST (preview) before running the DELETE steps.
-- =============================================================================

-- ── Step 0: Preview — see what's in a broken state ───────────────────────────

-- How many users have more than one subscription row? (should be 0 after mig 007)
SELECT
  user_id,
  COUNT(*)           AS row_count,
  array_agg(status ORDER BY updated_at DESC) AS statuses,
  array_agg(stripe_subscription_id ORDER BY updated_at DESC) AS sub_ids,
  MAX(updated_at)    AS latest_updated
FROM public.subscriptions
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY row_count DESC;

-- Users whose ONLY row is incomplete (payment never confirmed or webhook missed)
SELECT
  s.user_id,
  s.status,
  s.stripe_subscription_id,
  s.stripe_customer_id,
  s.created_at,
  s.updated_at
FROM public.subscriptions s
WHERE s.status IN ('incomplete', 'incomplete_expired')
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s2
    WHERE s2.user_id = s.user_id
      AND s2.status IN ('active', 'trialing', 'past_due', 'canceled')
  )
ORDER BY s.updated_at DESC;

-- ── Step 1: For users with multiple rows, keep the canonical one ─────────────
-- Priority: active > trialing > past_due > canceled > incomplete > most recent
--
-- Uncomment and run after reviewing Step 0 output.

/*
WITH ranked AS (
  SELECT
    id,
    user_id,
    status,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active'              THEN 1
          WHEN 'trialing'            THEN 2
          WHEN 'past_due'            THEN 3
          WHEN 'canceled'            THEN 4
          WHEN 'incomplete'          THEN 5
          WHEN 'incomplete_expired'  THEN 6
          ELSE 7
        END,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM public.subscriptions
)
DELETE FROM public.subscriptions s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;
*/

-- ── Step 2: Delete orphaned incomplete rows (no active/trialing exists) ───────
-- These accumulate when a user abandons checkout or retries multiple times
-- and neither the webhook nor verify-session cleaned them up.
--
-- SAFE: does not delete incomplete rows for users who have active/trialing
-- subscriptions — those users are premium regardless.
--
-- Uncomment and run after reviewing Step 0 output.

/*
DELETE FROM public.subscriptions
WHERE status IN ('incomplete', 'incomplete_expired')
  AND updated_at < NOW() - INTERVAL '24 hours'
  AND user_id NOT IN (
    SELECT DISTINCT user_id
    FROM public.subscriptions
    WHERE status IN ('active', 'trialing')
  );
*/

-- ── Step 3: After cleanup, verify the state ───────────────────────────────────

-- One row per user check (should return 0 rows after Step 1)
SELECT user_id, COUNT(*) AS cnt
FROM public.subscriptions
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Distribution of statuses
SELECT status, COUNT(*) AS cnt
FROM public.subscriptions
GROUP BY status
ORDER BY cnt DESC;

-- ── Step 4: Verify billing_events idempotency index exists ───────────────────

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'billing_events'
  AND indexname = 'billing_events_stripe_event_id_key';

-- ── Step 5: Verify subscriptions uniqueness indexes exist ────────────────────

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'subscriptions'
  AND indexname IN (
    'subscriptions_user_id_unique_idx',
    'subscriptions_stripe_subscription_id_unique_idx'
  );

-- =============================================================================
-- Root cause explanation for why incomplete rows were appearing:
--
-- 1. Stripe fires customer.subscription.created with status=incomplete BEFORE
--    payment is captured. The webhook correctly writes this row (no existing
--    active row to protect). This is EXPECTED behavior.
--
-- 2. After payment succeeds, Stripe fires customer.subscription.updated (active)
--    and checkout.session.completed. The webhook PATCHes the row to active.
--    This SHOULD work. But it was failing silently due to:
--
--    ROOT CAUSE (now fixed): insertBillingEvent was called BEFORE upsertSubscription.
--    If upsertSubscription failed and returned HTTP 500, Stripe retried. But on
--    retry, billing_events already had the event_id → isEventProcessed returned
--    true → webhook returned 200 WITHOUT writing the subscription. The row stayed
--    as incomplete permanently.
--
-- 3. Additional root cause: concurrent checkout attempts (user taps Upgrade
--    multiple times) created multiple Stripe subscriptions. Without migration 007's
--    unique user_id constraint, multiple incomplete rows could accumulate.
--
-- Both root causes are fixed in:
--   - webhook/route.js: billing_events now written AFTER subscription write
--   - webhook/route.js: atomic ON CONFLICT upsert (race-safe)
--   - migration 012: ensures user_id uniqueness index exists
-- =============================================================================
