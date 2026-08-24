-- 0168_note_department_overrides.sql
-- Calendar Notes filters by department, defaulting to whichever department the calendar
-- event itself is filed under. But that field exists to control calendar routing, not to
-- describe what a meeting is "about" -- a cross-functional meeting (e.g. a leadership
-- meeting Susanna filed under Ops for her own calendar, that Shelly might just as validly
-- think of as an LCP matter) doesn't have one right answer. This lets each person override
-- which department bucket a given event's notes fall under, for their own filtering only --
-- it never touches the event's real department or affects anyone else's view of it.

CREATE TABLE IF NOT EXISTS note_department_overrides (
  event_id   uuid       NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id    uuid       NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department department,                            -- null is a valid override ("file as All Staff for me")
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE note_department_overrides ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY note_department_overrides_all ON note_department_overrides
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
