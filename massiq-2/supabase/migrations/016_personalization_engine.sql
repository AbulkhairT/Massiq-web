-- =============================================================================
-- Migration 016: Personalization engine — decision runs, phase history,
-- muscle priorities, plan directives, user feedback events
-- =============================================================================
-- Safe to re-run (IF NOT EXISTS). Apply via Supabase SQL editor or `supabase db push`.

-- ─── 1. decision_engine_runs ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decision_engine_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id          uuid REFERENCES scans(id) ON DELETE SET NULL,
  plan_id          uuid REFERENCES plans(id) ON DELETE SET NULL,
  engine_version   text NOT NULL DEFAULT '2.0.0',
  trigger_type     text NOT NULL DEFAULT 'unknown',
  input_summary    jsonb NOT NULL DEFAULT '{}',
  output_json      jsonb NOT NULL DEFAULT '{}',
  input_snapshot   jsonb NOT NULL DEFAULT '{}',
  output_snapshot  jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decision_engine_runs_user_idx ON decision_engine_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS decision_engine_runs_scan_idx ON decision_engine_runs (scan_id);

-- ─── 2. phase_history ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phase_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id      uuid REFERENCES plans(id) ON DELETE SET NULL,
  scan_id      uuid REFERENCES scans(id) ON DELETE SET NULL,
  from_phase   text,
  to_phase     text NOT NULL,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phase_history_user_idx ON phase_history (user_id, created_at DESC);

-- ─── 3. muscle_priorities ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS muscle_priorities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id          uuid REFERENCES scans(id) ON DELETE SET NULL,
  muscle           text NOT NULL,
  priority_level   text NOT NULL DEFAULT 'medium',
  rationale        text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS muscle_priorities_user_scan_idx ON muscle_priorities (user_id, scan_id);

-- ─── 4. plan_directives ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_directives (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id          uuid REFERENCES plans(id) ON DELETE SET NULL,
  scan_id          uuid REFERENCES scans(id) ON DELETE SET NULL,
  directive_type   text NOT NULL,
  directives       jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_directives_user_idx ON plan_directives (user_id, created_at DESC);

-- ─── 5. user_feedback_events (adherence, habits — optional client logging) ─

CREATE TABLE IF NOT EXISTS user_feedback_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  scan_id      uuid REFERENCES scans(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_feedback_events_user_idx ON user_feedback_events (user_id, created_at DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE decision_engine_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE muscle_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_directives ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback_events ENABLE ROW LEVEL SECURITY;

-- decision_engine_runs
DROP POLICY IF EXISTS "decision_engine_runs_select_own" ON decision_engine_runs;
CREATE POLICY "decision_engine_runs_select_own" ON decision_engine_runs FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "decision_engine_runs_insert_own" ON decision_engine_runs;
CREATE POLICY "decision_engine_runs_insert_own" ON decision_engine_runs FOR INSERT WITH CHECK (user_id = auth.uid());

-- phase_history
DROP POLICY IF EXISTS "phase_history_select_own" ON phase_history;
CREATE POLICY "phase_history_select_own" ON phase_history FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "phase_history_insert_own" ON phase_history;
CREATE POLICY "phase_history_insert_own" ON phase_history FOR INSERT WITH CHECK (user_id = auth.uid());

-- muscle_priorities
DROP POLICY IF EXISTS "muscle_priorities_select_own" ON muscle_priorities;
CREATE POLICY "muscle_priorities_select_own" ON muscle_priorities FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "muscle_priorities_insert_own" ON muscle_priorities;
CREATE POLICY "muscle_priorities_insert_own" ON muscle_priorities FOR INSERT WITH CHECK (user_id = auth.uid());

-- plan_directives
DROP POLICY IF EXISTS "plan_directives_select_own" ON plan_directives;
CREATE POLICY "plan_directives_select_own" ON plan_directives FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "plan_directives_insert_own" ON plan_directives;
CREATE POLICY "plan_directives_insert_own" ON plan_directives FOR INSERT WITH CHECK (user_id = auth.uid());

-- user_feedback_events
DROP POLICY IF EXISTS "user_feedback_events_select_own" ON user_feedback_events;
CREATE POLICY "user_feedback_events_select_own" ON user_feedback_events FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "user_feedback_events_insert_own" ON user_feedback_events;
CREATE POLICY "user_feedback_events_insert_own" ON user_feedback_events FOR INSERT WITH CHECK (user_id = auth.uid());
