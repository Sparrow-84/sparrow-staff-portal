-- ============================================================
-- 0162_inv_submission_reminders.sql
-- Monthly inventory submission nudge — reuses the existing cross-system
-- Task/Triage engine (emit_system_task/resolve_system_task, from 0006
-- spine.sql) rather than building a separate notification mechanism.
-- Same pattern as the partnerships reminder engine (0080).
--
-- Behavior: starting 1 week before month-end, any location whose
-- designated submitter (inv_location_assignments.is_owner) hasn't yet
-- submitted this month's inventory gets a task assigned to them, due
-- the last day of the month. The task clears itself automatically the
-- moment the submission is actually submitted — not dismissible by
-- just looking at it, on purpose (Susanna's explicit ask: staff
-- shouldn't be able to see a nudge, think "I'll do that later," and
-- have it vanish and be forgotten).
--
-- A location with no designated submitter set is silently skipped —
-- there's nobody to assign the task to. Worth Susanna setting an
-- owner for every location now that the assignment-editing bug
-- (0161) is fixed.
-- ============================================================

CREATE OR REPLACE FUNCTION emit_inv_submission_reminders() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r          record;
  n          int := 0;
  today      date := current_date;
  month_end  date := (date_trunc('month', today) + interval '1 month - 1 day')::date;
  days_left  int  := month_end - today;
  cur_month  int  := extract(month from today)::int;
  cur_year   int  := extract(year from today)::int;
BEGIN
  -- Outside the last-week window: nothing to do yet.
  IF days_left > 6 THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT l.id AS location_id, l.name AS location_name, a.user_id AS owner_id
    FROM inv_locations l
    JOIN inv_location_assignments a ON a.location_id = l.id AND a.is_owner = true
    WHERE NOT EXISTS (
      SELECT 1 FROM inv_monthly_submissions s
      WHERE s.location_id = l.id
        AND s.period_month = cur_month
        AND s.period_year = cur_year
        AND s.status IN ('submitted', 'approved')
    )
  LOOP
    PERFORM emit_system_task(
      'inv',
      'monthly:' || r.location_id || ':' || cur_year || '-' || cur_month,
      r.owner_id,
      'Monthly inventory due — ' || r.location_name,
      'ops'::department,
      'p2'::priority,
      month_end
    );
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;

-- Clears the nudge the moment the submission is actually submitted —
-- fires regardless of which code path flips the status (form submit,
-- a future bulk-import, etc.), not just one specific button handler.
CREATE OR REPLACE FUNCTION inv_resolve_submission_reminder() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM resolve_system_task('inv', 'monthly:' || NEW.location_id || ':' || NEW.period_year || '-' || NEW.period_month);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inv_submission_resolves_reminder ON inv_monthly_submissions;
CREATE TRIGGER inv_submission_resolves_reminder
  AFTER INSERT OR UPDATE ON inv_monthly_submissions
  FOR EACH ROW EXECUTE FUNCTION inv_resolve_submission_reminder();

-- Daily at 13:00 UTC (~6am Pacific), same slot as the partnerships reminder
-- job — the function itself no-ops outside the last-week window, so running
-- daily all month is cheap and simple rather than trying to compute exact
-- fire dates per month length.
DO $$ BEGIN
  PERFORM cron.schedule(
    'inv-submission-reminders-daily',
    '0 13 * * *',
    'SELECT emit_inv_submission_reminders();'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
