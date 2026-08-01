-- Migration 0114: LCP Session Cal entries become real Team Cal events.
--
-- Every lcp_events row is now mirrored into a real calendar_events row (kept in
-- sync by triggers, not the fire-and-forget-on-load pattern used for birthdays/
-- holidays — this needs to happen synchronously so a newly created session's
-- attendee picker has a real event id to attach to). Once it's a real row,
-- RSVP (event_attendees), comments (event_comments), labels, and room booking
-- all just work — they already work on any calendar_events row, no new tables.
--
-- Division of labor: the Session Cal stays the only place to edit title/time/
-- location, and the only place a session can ever be deleted from — Team Cal
-- can fully use RSVP/comments/labels/room-booking on the same row, but can't
-- touch identity fields or delete. A session can never be deleted at all (from
-- the Session Cal) once a note has been filed for it in lcp_session_logs —
-- that's the actual protection this migration exists for.
--
-- source_system/source_ref already exist on calendar_events (0091's dedup
-- columns); reused here with source_system = 'lcp_session', source_ref = the
-- lcp_events row's id (as text).

-- Keeps the mirrored calendar_events row's title/time/location current whenever
-- the source lcp_events row is created or those fields change.
CREATE OR REPLACE FUNCTION sync_lcp_session_calendar_event() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.lcp_session_sync', 'true', true);
  INSERT INTO calendar_events (
    kind, title, starts_at, ends_at, all_day, location, recurrence_id,
    department, is_personal, created_by, source_system, source_ref
  )
  VALUES (
    'lcp_session', NEW.title, NEW.starts_at, NEW.ends_at, false, NEW.location, NEW.recurrence_id,
    'lcp', false, NEW.created_by, 'lcp_session', NEW.id::text
  )
  ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO UPDATE SET
    title = EXCLUDED.title,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    location = EXCLUDED.location,
    recurrence_id = EXCLUDED.recurrence_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lcp_events_sync_calendar ON lcp_events;
CREATE TRIGGER lcp_events_sync_calendar
  AFTER INSERT OR UPDATE OF title, starts_at, ends_at, location, recurrence_id ON lcp_events
  FOR EACH ROW EXECUTE FUNCTION sync_lcp_session_calendar_event();

-- Blocks deleting a session once a note has been filed for it — the real
-- protection this migration is for. No note yet → deletes normally.
CREATE OR REPLACE FUNCTION guard_lcp_session_delete() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lcp_session_logs WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'This session has a note filed for it and can no longer be deleted.';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS lcp_events_guard_delete ON lcp_events;
CREATE TRIGGER lcp_events_guard_delete
  BEFORE DELETE ON lcp_events
  FOR EACH ROW EXECUTE FUNCTION guard_lcp_session_delete();

-- Removes the mirrored Team Cal row once its source session is actually
-- deleted (only reachable once the guard above has let the delete through).
CREATE OR REPLACE FUNCTION cleanup_lcp_session_calendar_event() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.lcp_session_sync', 'true', true);
  DELETE FROM calendar_events WHERE source_system = 'lcp_session' AND source_ref = OLD.id::text;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS lcp_events_cleanup_calendar ON lcp_events;
CREATE TRIGGER lcp_events_cleanup_calendar
  AFTER DELETE ON lcp_events
  FOR EACH ROW EXECUTE FUNCTION cleanup_lcp_session_calendar_event();

-- Team Cal can freely RSVP/comment/label/book-a-room on a mirrored session
-- (none of those touch the columns checked below), but can't change its
-- title/time/location (would silently drift from the Session Cal's copy) or
-- delete it directly (must go through the Session Cal, which has its own
-- note guard above). The app.lcp_session_sync flag lets the legitimate sync/
-- cleanup functions above through without tripping this guard on themselves.
CREATE OR REPLACE FUNCTION guard_lcp_session_calendar_event() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.lcp_session_sync', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_system = 'lcp_session' THEN
      RAISE EXCEPTION 'This session can only be deleted from the LCP Session Cal.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.source_system = 'lcp_session' AND (
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.starts_at IS DISTINCT FROM OLD.starts_at OR
    NEW.ends_at IS DISTINCT FROM OLD.ends_at OR
    NEW.location IS DISTINCT FROM OLD.location
  ) THEN
    RAISE EXCEPTION 'Title, time, and location for this session can only be changed from the LCP Session Cal.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS calendar_events_guard_lcp_session ON calendar_events;
CREATE TRIGGER calendar_events_guard_lcp_session
  BEFORE UPDATE OR DELETE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION guard_lcp_session_calendar_event();

-- Backfill: mirror every already-scheduled session immediately, rather than
-- waiting for its next edit to bring it onto the Team Cal.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM lcp_events LOOP
    INSERT INTO calendar_events (
      kind, title, starts_at, ends_at, all_day, location, recurrence_id,
      department, is_personal, created_by, source_system, source_ref
    )
    VALUES (
      'lcp_session', r.title, r.starts_at, r.ends_at, false, r.location, r.recurrence_id,
      'lcp', false, r.created_by, 'lcp_session', r.id::text
    )
    ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
  END LOOP;
END $$;
