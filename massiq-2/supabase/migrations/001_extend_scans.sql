-- =============================================================================
-- Migration 001: Extend scans table + add scan_assets table
-- =============================================================================
-- Run this in the Supabase SQL editor or via `supabase db push`.
-- All statements use IF NOT EXISTS / IF EXISTS guards — safe to re-run.
--
-- MANUAL SUPABASE STEPS ALSO REQUIRED (see bottom of file):
--   1. Create Storage bucket "scan-photos" (private)
--   2. Add Storage policies for authenticated users
-- =============================================================================

-- ─── 1. Extend the scans table ───────────────────────────────────────────────

-- engine_version: tracks which scoring/engine version produced this scan
ALTER TABLE scans ADD COLUMN IF NOT EXISTS engine_version text;

-- scan_status: 'complete' | 'duplicate' | 'error' | 'pending'
ALTER TABLE scans ADD COLUMN IF NOT EXISTS scan_status text DEFAULT 'complete';

-- duplicate_of_scan_id: self-referential FK when this scan reuses a prior result
ALTER TABLE scans ADD COLUMN IF NOT EXISTS duplicate_of_scan_id uuid REFERENCES scans(id) ON DELETE SET NULL;

-- asset_id: FK to the scan_assets table (photo that produced this scan)
ALTER TABLE scans ADD COLUMN IF NOT EXISTS asset_id uuid;

-- scan_context: JSONB blob storing:
--   adaptation  { decision, rationale, adjustment }
--   comparison  { days_elapsed, bf_delta, lm_delta_lbs, score_delta, ... }
--   scoring_breakdown  { bodyComposition, muscularity, visualAssessment, confidenceBonus }
--   scoring_version, ffmi, image_hash, perceptual_hash, schema_version
ALTER TABLE scans ADD COLUMN IF NOT EXISTS scan_context jsonb;

-- ─── 2. Create scan_assets table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scan_assets (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path     text        NOT NULL,          -- path inside the scan-photos bucket
  mime_type        text,
  file_size_bytes  integer,
  sha256           text        NOT NULL,           -- exact-duplicate detection
  perceptual_hash  text,                           -- near-duplicate detection (dHash, 16 hex chars)
  width            integer,
  height           integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Index for fast SHA-256 lookup per user
CREATE INDEX IF NOT EXISTS scan_assets_sha256_user_idx ON scan_assets (user_id, sha256);
-- Index for linking scans to assets
CREATE INDEX IF NOT EXISTS scans_asset_id_idx ON scans (asset_id);

-- ─── 3. Add FK from scans → scan_assets (deferred — avoids ordering issues) ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'scans_asset_id_fkey'
      AND table_name = 'scans'
  ) THEN
    ALTER TABLE scans
      ADD CONSTRAINT scans_asset_id_fkey
      FOREIGN KEY (asset_id) REFERENCES scan_assets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 4. Row Level Security for scan_assets ────────────────────────────────────

ALTER TABLE scan_assets ENABLE ROW LEVEL SECURITY;

-- Users can only see, insert, update, and delete their own assets
DROP POLICY IF EXISTS "users_own_assets_select" ON scan_assets;
CREATE POLICY "users_own_assets_select"
  ON scan_assets FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_assets_insert" ON scan_assets;
CREATE POLICY "users_own_assets_insert"
  ON scan_assets FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_assets_update" ON scan_assets;
CREATE POLICY "users_own_assets_update"
  ON scan_assets FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_assets_delete" ON scan_assets;
CREATE POLICY "users_own_assets_delete"
  ON scan_assets FOR DELETE
  USING (user_id = auth.uid());

-- ─── 5. Ensure existing scans RLS allows SELECT of new columns ───────────────
-- (No change needed — RLS on scans table already grants per-user access.
--  New columns inherit the same policy automatically.)

-- =============================================================================
-- MANUAL SUPABASE STEPS (cannot be done via SQL)
-- =============================================================================
--
-- 1. Create Storage bucket:
--    Dashboard → Storage → New Bucket
--    Name: scan-photos
--    Public: NO (private — files served only via signed URLs)
--
-- 2. Add Storage policies (Dashboard → Storage → scan-photos → Policies):
--
--    Policy: "Users upload their own scan photos"
--    Operation: INSERT
--    Target roles: authenticated
--    USING expression:  (bucket_id = 'scan-photos') AND ((storage.foldername(name))[1] = auth.uid()::text)
--
--    Policy: "Users read their own scan photos"
--    Operation: SELECT
--    Target roles: authenticated
--    USING expression:  (bucket_id = 'scan-photos') AND ((storage.foldername(name))[1] = auth.uid()::text)
--
-- 3. (Optional) Enable Supabase pg_cron for cleanup of orphaned assets:
--    SELECT cron.schedule('cleanup-orphaned-assets', '0 3 * * *',
--      $$DELETE FROM scan_assets WHERE created_at < NOW() - INTERVAL '90 days' AND id NOT IN (SELECT asset_id FROM scans WHERE asset_id IS NOT NULL)$$
--    );
-- =============================================================================
