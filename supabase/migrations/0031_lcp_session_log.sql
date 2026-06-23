-- Migration 0031: LCP Session Log
-- Structured per-session logging for Monday Mentoring, Thursday Group, and ad-hoc sessions.
-- Decoupled from lcp_events — a session log can reference a calendar event but doesn't require one.
-- Staff file attendance, per-family attributed notes, shared group notes (Thursday), and homework.

DO $$ BEGIN
  CREATE TYPE session_log_type AS ENUM ('monday_mentoring', 'thursday_group', 'ad_hoc');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- One row per logged session (one staff member filing = one row).
-- Multiple staff can file separate logs for the same evening.
CREATE TABLE IF NOT EXISTS lcp_session_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date date        NOT NULL,
  session_type session_log_type NOT NULL,
  event_id     uuid        REFERENCES lcp_events(id) ON DELETE SET NULL,
  group_note   text,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz
);
CREATE INDEX IF NOT EXISTS lcp_session_logs_date_idx ON lcp_session_logs(session_date DESC);
CREATE TRIGGER lcp_session_logs_updated_at
  BEFORE UPDATE ON lcp_session_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Per-family attendance and voucher record for a session log.
CREATE TABLE IF NOT EXISTS lcp_session_attendance (
  id             uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  session_log_id uuid             NOT NULL REFERENCES lcp_session_logs(id) ON DELETE CASCADE,
  family_id      uuid             NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  status         attendance_status NOT NULL DEFAULT 'on_time',
  voucher_awarded boolean          NOT NULL DEFAULT false,
  marked_by      uuid             REFERENCES profiles(id) ON DELETE SET NULL,
  marked_at      timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (session_log_id, family_id)
);
CREATE INDEX IF NOT EXISTS lcp_session_attendance_log_idx ON lcp_session_attendance(session_log_id);

-- Link staff notes to the session log they were filed in; track edits.
ALTER TABLE lcp_staff_notes
  ADD COLUMN IF NOT EXISTS session_log_id uuid REFERENCES lcp_session_logs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

DROP TRIGGER IF EXISTS staff_notes_updated_at ON lcp_staff_notes;
CREATE TRIGGER staff_notes_updated_at
  BEFORE UPDATE ON lcp_staff_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────

ALTER TABLE lcp_session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lcp_session_attendance ENABLE ROW LEVEL SECURITY;

-- Extended LCP staff can read; full LCP staff can write.
CREATE POLICY "lcp_session_logs_select" ON lcp_session_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND lcp_role IS NOT NULL)
  );

CREATE POLICY "lcp_session_logs_insert" ON lcp_session_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND lcp_role = 'full')
  );

CREATE POLICY "lcp_session_logs_update" ON lcp_session_logs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND lcp_role = 'full')
  );

CREATE POLICY "lcp_session_attendance_select" ON lcp_session_attendance
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND lcp_role IS NOT NULL)
  );

CREATE POLICY "lcp_session_attendance_insert" ON lcp_session_attendance
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND lcp_role = 'full')
  );

CREATE POLICY "lcp_session_attendance_update" ON lcp_session_attendance
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND lcp_role = 'full')
  );
