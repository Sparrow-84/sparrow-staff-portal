-- ============================================================
-- 0210 — Partnerships Home: show a reminder's pre-written message
-- ============================================================
-- Prayer check-in tasks carry a ready-to-send message in tasks.notes (0178). Home
-- lists every open Partnerships reminder via partnerships_open_reminders() (0209), but
-- that returns no notes, and tasks' own RLS only shows a task to its assignee -- so only
-- the room admin could ever see the message. This returns the message for each open
-- prayer check-in to anyone with Partnerships access, so whoever is covering can copy and
-- send it from Home.
--
-- A separate function (rather than adding a column to partnerships_open_reminders) so the
-- live app is unaffected until this runs: Home simply shows no message until then.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION partnerships_open_reminder_messages()
RETURNS TABLE (source_ref text, notes text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.source_ref, t.notes
  FROM tasks t
  WHERE partnerships_has_access()
    AND t.department = 'partnerships'
    AND t.source_system = 'crm'
    AND t.status <> 'done'
    AND t.notes IS NOT NULL
    AND (t.source_ref LIKE 'prayer_miss:%' OR t.source_ref LIKE 'prayer_snooze_check:%');
$$;
GRANT EXECUTE ON FUNCTION partnerships_open_reminder_messages() TO authenticated;
