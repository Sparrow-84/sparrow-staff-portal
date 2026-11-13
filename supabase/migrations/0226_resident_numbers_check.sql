-- 0226: Essential Phone Numbers — one check of the whole list, every 2 years.
-- Run AFTER 0225 (needs resident_numbers from 0220 and resident_services_room_admins from 0206).
--
-- Decided with the product owner 2026-11-13: checking every number before every print won't
-- happen. Instead the whole list is checked together, in the check-in style used elsewhere
-- (one editable "Next check" date; "✓ All checked" asks when the next one is, default 2 years):
--   * green  until two weeks before the Next check date;
--   * amber  from two weeks before → the room admins get a task (p3), due the Next check date;
--   * red    once the Next check date passes → a second, higher-priority task (p2) that
--            replaces the first.
--   * Clicking "✓ All checked" (or finishing the task from a task list) closes the tasks.
--     From a task list, the next check is set 2 years out.
--   * The Next check date can only be set by "✓ All checked" (any time, early is fine), and is
--     never more than 2 years out. There is no way to just move it later. (Decided 2026-11-13.)
-- Starts with no check recorded (the room shows "Not checked yet" and sends no task) until
-- someone clicks "✓ All checked" for the first time.
--
-- Idempotent: safe to run twice.

-- ─── 1. One row holding the list's check dates ────────────────────────
CREATE TABLE IF NOT EXISTS resident_numbers_check (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),   -- only ever one row
  last_checked_on date,
  last_checked_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  next_check_on   date,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE resident_numbers_check IS
  'Essential Phone Numbers: when the whole list was last checked and when the next check is due (one row).';

INSERT INTO resident_numbers_check (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE resident_numbers_check ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY resident_numbers_check_read ON resident_numbers_check
    FOR SELECT USING (resident_services_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY resident_numbers_check_update ON resident_numbers_check
    FOR UPDATE USING (resident_services_has_access()) WITH CHECK (resident_services_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

GRANT SELECT, UPDATE ON resident_numbers_check TO authenticated;

-- ─── 2. Daily: amber task two weeks ahead, red task once it's overdue ───
CREATE OR REPLACE FUNCTION emit_resident_numbers_check_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  a record;
  v_ref text;
  n int := 0;
BEGIN
  SELECT * INTO c FROM resident_numbers_check WHERE id;
  IF c.next_check_on IS NULL OR c.next_check_on - 14 > current_date THEN
    RETURN 0;
  END IF;
  FOR a IN SELECT * FROM resident_services_room_admins() LOOP
    -- The Next check date is part of the ref, so each cycle gets fresh tasks.
    v_ref := 'numbers_check:' || c.next_check_on || ':' || a.id;
    IF current_date > c.next_check_on THEN
      PERFORM emit_system_task(
        'resident_services', v_ref || ':overdue', a.id,
        'Overdue — check every number on the Essential Phone Numbers list',
        a.dept, 'p2'::priority, c.next_check_on,
        'The check was due ' || to_char(c.next_check_on, 'FMMonth FMDD, YYYY') || '. In the Resident Services room, '
          || 'open the Essential Phone Numbers tab, call or look up each number, fix any that changed, '
          || 'then click "✓ All checked".'
      );
      -- The overdue task replaces the two-week one. Removed, not marked done: marking it done
      -- would count as "All checked" (section 4) when nothing was checked.
      DELETE FROM tasks
       WHERE source_system = 'resident_services' AND source_ref = v_ref AND status <> 'done';
    ELSE
      PERFORM emit_system_task(
        'resident_services', v_ref, a.id,
        'Check every number on the Essential Phone Numbers list',
        a.dept, 'p3'::priority, c.next_check_on,
        'Due ' || to_char(c.next_check_on, 'FMMonth FMDD, YYYY') || '. In the Resident Services room, '
          || 'open the Essential Phone Numbers tab, call or look up each number, fix any that changed, '
          || 'then click "✓ All checked".'
      );
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION emit_resident_numbers_check_tasks() FROM PUBLIC;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION emit_resident_numbers_check_tasks() FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;

-- Daily at 13:00 UTC (~6am Pacific), same slot as the other reminder jobs.
DO $$ BEGIN
  PERFORM cron.unschedule('resident-numbers-check-daily');
EXCEPTION WHEN OTHERS THEN null;
END $$;
DO $$ BEGIN
  PERFORM cron.schedule('resident-numbers-check-daily', '0 13 * * *', 'SELECT emit_resident_numbers_check_tasks();');
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- ─── 3. "✓ All checked" closes the tasks; the date can't just be pushed back ──
-- The Next check date is only ever set while marking the whole list checked today, and never
-- more than 2 years out -- so it can't be moved back again and again without a check.
CREATE OR REPLACE FUNCTION on_resident_numbers_checked() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.next_check_on IS DISTINCT FROM OLD.next_check_on THEN
    IF NEW.last_checked_on IS DISTINCT FROM current_date THEN
      RAISE EXCEPTION 'The next check date can only be set when the whole list is checked.';
    END IF;
    IF NEW.next_check_on IS NULL OR NEW.next_check_on <= current_date
       OR NEW.next_check_on > (current_date + interval '2 years')::date THEN
      RAISE EXCEPTION 'The next check must be after today and no more than 2 years away.';
    END IF;
  END IF;
  -- Checked: the open tasks are done.
  IF NEW.last_checked_on IS DISTINCT FROM OLD.last_checked_on AND NEW.last_checked_on IS NOT NULL THEN
    UPDATE tasks SET status = 'done', updated_at = now()
     WHERE source_system = 'resident_services' AND source_ref LIKE 'numbers_check:%' AND status <> 'done';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS resident_numbers_checked ON resident_numbers_check;
CREATE TRIGGER resident_numbers_checked BEFORE UPDATE ON resident_numbers_check
  FOR EACH ROW EXECUTE FUNCTION on_resident_numbers_checked();

-- ─── 4. Finishing the task from a task list counts as "All checked" ────
-- Only when a person finishes it directly (trigger depth 1). When "✓ All checked" closes it,
-- the list already says checked today and nothing changes.
CREATE OR REPLACE FUNCTION on_resident_numbers_check_task_done() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  UPDATE resident_numbers_check
     SET last_checked_on = current_date,
         last_checked_by = COALESCE(auth.uid(), NEW.assignee_id),
         next_check_on   = (current_date + interval '2 years')::date
   WHERE id AND last_checked_on IS DISTINCT FROM current_date;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS resident_numbers_check_task_done ON tasks;
CREATE TRIGGER resident_numbers_check_task_done
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (
    NEW.status = 'done'
    AND OLD.status IS DISTINCT FROM 'done'
    AND NEW.source_system = 'resident_services'
    AND NEW.source_ref LIKE 'numbers_check:%'
  )
  EXECUTE FUNCTION on_resident_numbers_check_task_done();
