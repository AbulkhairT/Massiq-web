-- =============================================================================
-- Migration 013: profiles table hardening
-- =============================================================================
-- 1. Adds the `name` column (was missing — code has always tried to write it)
-- 2. Deduplicates existing rows (keeps most-recently created row per user id)
-- 3. Adds a UNIQUE index on id (prevents future duplicate rows per user)
--
-- SAFE TO RUN MULTIPLE TIMES — all statements are idempotent.
-- =============================================================================

-- ── 1. Add name column ────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name text;

-- ── 2. Remove duplicate rows — keep the latest created_at per user id ────────
--
-- Supabase REST upsertProfile uses on_conflict=id but the id column had no
-- UNIQUE constraint, so concurrent or repeated inserts created multiple rows.
-- This removes extras, preserving the most recent row for each user.

DELETE FROM public.profiles
WHERE ctid NOT IN (
  SELECT DISTINCT ON (id) ctid
  FROM public.profiles
  ORDER BY id, created_at DESC NULLS LAST
);

-- ── 3. Enforce one row per user ───────────────────────────────────────────────
--
-- A UNIQUE index on id is required for the PostgREST on_conflict=id upsert to
-- work correctly. Without it, on_conflict silently falls back to a plain insert.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_id_unique_idx
  ON public.profiles (id);

-- =============================================================================
-- After running this migration:
--   • name column exists — upsertProfile can write and read it
--   • exactly one row per user id
--   • on_conflict=id in REST calls will correctly upsert (no new duplicates)
-- =============================================================================
