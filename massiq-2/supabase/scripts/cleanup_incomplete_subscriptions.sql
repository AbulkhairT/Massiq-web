-- =============================================================================
-- Cleanup script: Remove incomplete/duplicate subscription rows
-- =============================================================================
-- Run manually in Supabase SQL Editor if you have bad test data.
-- Prerequisites: Migration 007 (one row per user) should be applied.
--
-- This script:
-- 1. For each user with multiple rows, keeps only the best one (active > trialing > most recent)
-- 2. Deletes orphaned incomplete rows when user has active/trialing
-- =============================================================================

-- Step 1: Identify duplicates (run as SELECT first to preview)
SELECT user_id, COUNT(*) AS cnt, array_agg(status) AS statuses
FROM public.subscriptions
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Step 2: Delete duplicate rows, keeping the canonical one per user
-- (Keeps: active > trialing > past_due > canceled > most recent by updated_at)
WITH ranked AS (
  SELECT
    id,
    user_id,
    status,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active'   THEN 1
          WHEN 'trialing' THEN 2
          WHEN 'past_due' THEN 3
          WHEN 'canceled' THEN 4
          ELSE 5
        END,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    ) AS rn
  FROM public.subscriptions
)
DELETE FROM public.subscriptions s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;
