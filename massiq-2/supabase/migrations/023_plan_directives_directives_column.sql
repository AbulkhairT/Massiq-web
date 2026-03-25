-- plan_directives: jsonb column `directives` (replaces legacy `payload`); drop `directive_key`.

ALTER TABLE public.plan_directives
  ADD COLUMN IF NOT EXISTS directives jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plan_directives' AND column_name = 'payload'
  ) THEN
    UPDATE public.plan_directives
    SET directives = COALESCE(payload, '{}'::jsonb);
    ALTER TABLE public.plan_directives DROP COLUMN payload;
  END IF;
END $$;

ALTER TABLE public.plan_directives DROP COLUMN IF EXISTS directive_key;
