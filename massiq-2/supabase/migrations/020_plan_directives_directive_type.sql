-- Align plan_directives column name with PostgREST / live DB (directive_type).
-- Fresh installs from 016 used "category"; production may already use directive_type.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plan_directives' AND column_name = 'category'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plan_directives' AND column_name = 'directive_type'
  ) THEN
    ALTER TABLE public.plan_directives RENAME COLUMN category TO directive_type;
  END IF;
END $$;
