-- =============================================================================
-- Migration 014: Profiles preferences + Plans rolling fields
-- =============================================================================
-- Profiles: add diet_prefs, cuisines, avoid (JSONB arrays) for persistence
-- Plans: add start_date, week for rolling plan logic
--
-- SAFE TO RUN MULTIPLE TIMES (all statements are idempotent).
-- =============================================================================

-- ── 1. Profiles: preferences columns ─────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS diet_prefs  jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS cuisines    jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS avoid       jsonb DEFAULT '[]';

-- ── 2. Plans: rolling fields ─────────────────────────────────────────────────

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS start_date  date,
  ADD COLUMN IF NOT EXISTS week        integer;
