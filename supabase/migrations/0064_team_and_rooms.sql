-- 0064_team_and_rooms.sql
-- Team profile fields (schedule, blurb, photo, role description) + office room booking.

-- ── Profile additions ─────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS work_schedule jsonb,     -- { days: string[], start: string, end: string }
  ADD COLUMN IF NOT EXISTS blurb         text,      -- staff-written self-intro
  ADD COLUMN IF NOT EXISTS photo_url     text,      -- optional profile photo (Supabase Storage URL)
  ADD COLUMN IF NOT EXISTS role_description text;   -- one-liner set by admin at account creation

-- ── Office rooms ──────────────────────────────────────────────────────
-- Stored in a table (not hardcoded) so new-building room changes are admin config, not migrations.
CREATE TABLE IF NOT EXISTS office_rooms (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text    NOT NULL,
  blocks_whole_office boolean NOT NULL DEFAULT false,
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          int     NOT NULL DEFAULT 0
);

ALTER TABLE office_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY office_rooms_read ON office_rooms
  FOR SELECT TO authenticated USING (true);

CREATE POLICY office_rooms_write ON office_rooms
  FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK(EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

INSERT INTO office_rooms (name, blocks_whole_office, sort_order) VALUES
  ('Resident Services Desk', true,  1),
  ('Main Office Room',       false, 2),
  ('Prayer Room',            false, 3),
  ('Kids'' Room',            false, 4),
  ('Whole Office',           false, 5);

-- ── Calendar event additions ──────────────────────────────────────────
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS room_id            uuid    REFERENCES office_rooms(id),
  ADD COLUMN IF NOT EXISTS is_private_meeting boolean NOT NULL DEFAULT false;
