-- 0225: Resident Services re-check tasks — a second alert at 18 months, and real due dates.
--
-- Before: one task at 9 months, and nothing when a program turns red at 18 months. The task's
-- due date was reset to "today" every morning by the daily job, so it never looked overdue.
--
-- After:
--   * 9 months  → "Re-check service info" task (p3), due the day the program hit 9 months.
--   * 18 months → a NEW "Overdue — not checked in 18 months" task (p2), due the day it hit
--                 18 months. It's a separate task, so it arrives even if the 9-month one was
--                 closed. The 9-month task is closed when it arrives (the 18-month one replaces it).
--   * Both close on their own when someone clicks "Still correct", edits the program, or
--     archives it (existing trigger: its ref match 'recheck:<id>%' covers both).
--
-- Idempotent: CREATE OR REPLACE only. Runs any time after 0206. The daily cron job
-- ('resident-service-recheck-daily') already calls this function; nothing to reschedule.

CREATE OR REPLACE FUNCTION emit_resident_service_recheck_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  a record;
  n int := 0;
  v_ref text;
BEGIN
  FOR r IN
    SELECT s.id, s.name, s.last_checked_at, COALESCE(p.name, s.provider_name) AS provider,
           s.last_checked_at < now() - interval '18 months' AS red
    FROM resident_services s
    LEFT JOIN partners p ON p.id = s.partner_id
    WHERE s.archived_at IS NULL
      AND NOT s.needs_review
      AND s.last_checked_at < now() - interval '9 months'
  LOOP
    FOR a IN SELECT * FROM resident_services_room_admins() LOOP
      -- The check date is part of the ref, so each check cycle gets fresh tasks.
      v_ref := 'recheck:' || r.id || ':' || to_char(r.last_checked_at, 'YYYYMMDD') || ':' || a.id;

      IF r.red THEN
        PERFORM emit_system_task(
          'resident_services', v_ref || ':18m', a.id,
          'Overdue — not checked in 18 months: ' || r.provider || ': ' || r.name,
          a.dept, 'p2'::priority, (r.last_checked_at + interval '18 months')::date,
          'This program has not been checked in over 18 months and shows red in the Resident Services room. '
            || 'Call them or check their website, then click "Still correct" (or edit what changed). '
            || 'If the program has closed, archive it.'
        );
        -- The 18-month task replaces the 9-month one.
        UPDATE tasks SET status = 'done', updated_at = now()
         WHERE source_system = 'resident_services' AND source_ref = v_ref AND status <> 'done';
      ELSE
        PERFORM emit_system_task(
          'resident_services', v_ref, a.id,
          'Re-check service info — ' || r.provider || ': ' || r.name,
          a.dept, 'p3'::priority, (r.last_checked_at + interval '9 months')::date,
          'Call them or check their website, then click "Still correct" (or edit what changed) on the service in the Resident Services room.'
        );
      END IF;
    END LOOP;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION emit_resident_service_recheck_tasks() FROM PUBLIC;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION emit_resident_service_recheck_tasks() FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;
