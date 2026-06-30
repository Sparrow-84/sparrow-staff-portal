-- ============================================================
-- 0043_prayer_volunteers.sql
-- Prayer volunteer roster + weekly meeting attendance log.
--
-- Three tables:
--   prayer_volunteers  — the people who pray for Sparrow
--   prayer_meetings    — one row per weekly meeting
--   prayer_attendance  — one row per volunteer per meeting
--
-- Business rules (enforced in app, not DB):
--   • 4 consecutive absences → auto-flag task to owner
--   • partner_id links to an existing partners row if the
--     volunteer is also tracked in the CRM (optional)
-- ============================================================

-- ── prayer_volunteers ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prayer_volunteers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid        REFERENCES partners(id) ON DELETE SET NULL,
  full_name   text        NOT NULL,
  email       text,
  phone       text,
  notes       text,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prayer_volunteers_partner_idx
  ON prayer_volunteers(partner_id);

ALTER TABLE prayer_volunteers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY prayer_volunteers_staff ON prayer_volunteers
    FOR ALL TO authenticated
    USING   (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── prayer_meetings ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prayer_meetings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date date        NOT NULL,
  notes        text,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_date)
);

ALTER TABLE prayer_meetings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY prayer_meetings_staff ON prayer_meetings
    FOR ALL TO authenticated
    USING   (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── prayer_attendance ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prayer_attendance (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   uuid        NOT NULL REFERENCES prayer_meetings(id)   ON DELETE CASCADE,
  volunteer_id uuid        NOT NULL REFERENCES prayer_volunteers(id) ON DELETE CASCADE,
  attended     boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS prayer_attendance_meeting_idx
  ON prayer_attendance(meeting_id);
CREATE INDEX IF NOT EXISTS prayer_attendance_volunteer_idx
  ON prayer_attendance(volunteer_id);

ALTER TABLE prayer_attendance ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY prayer_attendance_staff ON prayer_attendance
    FOR ALL TO authenticated
    USING   (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
