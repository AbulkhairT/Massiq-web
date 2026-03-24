-- =============================================================================
-- Migration 019: Align muscle_priorities column names with production schema
-- =============================================================================
-- Legacy 016 used muscle_key, priority_tier, notes. Production uses muscle,
-- priority_level, rationale. Rename only when old columns exist and new do not.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'muscle_priorities' AND column_name = 'muscle_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'muscle_priorities' AND column_name = 'muscle'
  ) THEN
    ALTER TABLE public.muscle_priorities RENAME COLUMN muscle_key TO muscle;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'muscle_priorities' AND column_name = 'priority_tier'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'muscle_priorities' AND column_name = 'priority_level'
  ) THEN
    ALTER TABLE public.muscle_priorities RENAME COLUMN priority_tier TO priority_level;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'muscle_priorities' AND column_name = 'notes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'muscle_priorities' AND column_name = 'rationale'
  ) THEN
    ALTER TABLE public.muscle_priorities RENAME COLUMN notes TO rationale;
  END IF;
END $$;
