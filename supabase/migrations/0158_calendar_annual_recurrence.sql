-- "Repeats every year" for any calendar event (staff/dept/personal) -- e.g. a
-- personal birthday someone wants on their own calendar every year, same idea
-- as staff birthdays but user-initiated instead of pulled from a profile.
-- Follows the exact emit_staff_birthday_events() convention: the row the
-- user creates (with recurs_annually = true) is the anchor; a SECURITY
-- DEFINER emitter materializes this year's + next year's copy from it,
-- deduped by source_ref so re-running (every calendar load) is a no-op once
-- a year's copy exists. Copies themselves are NOT anchors (recurs_annually
-- defaults to false on them), so the emitter never processes its own output.

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurs_annually boolean NOT NULL DEFAULT false;

-- Emits this year's and next year's occurrence for every anchor row, shifting
-- the whole timestamp (date + time-of-day) forward/back by whole years --
-- simpler and more correct than rebuilding the date from extracted
-- month/day/hour/minute, and Postgres's own interval arithmetic already
-- handles the Feb 29 edge case sensibly (rolls to Mar 1 in a non-leap year).
-- Skips the target year that equals the anchor's own year, since that
-- occurrence already exists as the anchor row itself.
CREATE OR REPLACE FUNCTION emit_annual_calendar_events() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  anchor      record;
  anchor_year int;
  target_year int;
  year_shift  int;
  n           int := 0;
BEGIN
  FOR anchor IN
    SELECT * FROM calendar_events WHERE recurs_annually = true
  LOOP
    anchor_year := extract(year FROM anchor.starts_at)::int;

    FOR target_year IN extract(year FROM current_date)::int .. extract(year FROM current_date)::int + 1 LOOP
      IF target_year = anchor_year THEN CONTINUE; END IF;
      year_shift := target_year - anchor_year;

      INSERT INTO calendar_events (
        kind, title, starts_at, ends_at, all_day, location, department, is_personal,
        created_by, room_id, is_private_meeting, label_id, source_system, source_ref
      ) VALUES (
        anchor.kind, anchor.title,
        anchor.starts_at + make_interval(years => year_shift),
        CASE WHEN anchor.ends_at IS NOT NULL THEN anchor.ends_at + make_interval(years => year_shift) ELSE NULL END,
        anchor.all_day, anchor.location, anchor.department, anchor.is_personal,
        anchor.created_by, anchor.room_id, anchor.is_private_meeting, anchor.label_id,
        'user_annual', 'user_annual:' || anchor.id || ':' || target_year
      )
      ON CONFLICT (source_system, source_ref) DO NOTHING;
      n := n + 1;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;
