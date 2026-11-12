-- Sparrow Staff Portal — Partnerships Home fixes. Run AFTER 0220. Safe to run more than once.
--
-- Decided with the product owner 2026-11-11 while auditing Partnerships Home:
--   1. My Contacts / All Staff Contacts is removed from the portal entirely. Only one person
--      used it, and an email to the Partnerships Coordinator does the same job. The product
--      owner has already sent the saved contacts on, so the table is dropped, not kept.
--   2. Comms milestones: finishing the milestone's task anywhere (Home, Incoming Tasks) now
--      marks the milestone done on the Calendar. Before, only the Calendar -> task direction
--      worked. Also: un-marking a milestone reopens its task (it used to stay done forever),
--      changing the milestone's owner moves the open task, and deleting a milestone removes it.
--   3. First-time donors already get an automated thank-you, so the separate "First-time
--      donor follow-up (72-hr window)" task is no longer created, and open ones are closed.

-- ─── 1. Remove personal contacts ───────────────────────────────────────
DELETE FROM notifications WHERE type = 'new_contact';
DROP TABLE IF EXISTS personal_contacts CASCADE;           -- also drops its triggers + policies
DROP FUNCTION IF EXISTS notify_new_personal_contact();
DROP FUNCTION IF EXISTS mark_personal_contact_converted(uuid, uuid);

-- ─── 2. Comms milestones and their tasks stay in step ──────────────────
CREATE OR REPLACE FUNCTION on_comms_milestone_completed() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ref text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM tasks
     WHERE source_system = 'crm' AND source_ref = 'comms_milestone:' || OLD.id AND status <> 'done';
    RETURN OLD;
  END IF;
  v_ref := 'comms_milestone:' || NEW.id;
  -- Marked done on the Calendar: close the task.
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    PERFORM resolve_system_task('crm', v_ref);
  -- Un-marked: reopen it, so the reminder comes back (the emitter never reopens a done task).
  ELSIF NEW.completed_at IS NULL AND OLD.completed_at IS NOT NULL THEN
    UPDATE tasks SET status = 'todo', updated_at = now()
     WHERE source_system = 'crm' AND source_ref = v_ref AND status = 'done';
  END IF;
  -- New owner: hand the open task over.
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NEW.owner_id IS NOT NULL THEN
    UPDATE tasks SET assignee_id = NEW.owner_id, updated_at = now()
     WHERE source_system = 'crm' AND source_ref = v_ref AND status <> 'done';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partnership_comms_milestone_completed ON partnership_comms_milestones;
CREATE TRIGGER partnership_comms_milestone_completed AFTER UPDATE ON partnership_comms_milestones
  FOR EACH ROW WHEN (
    OLD.completed_at IS DISTINCT FROM NEW.completed_at
    OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
  )
  EXECUTE FUNCTION on_comms_milestone_completed();

DROP TRIGGER IF EXISTS partnership_comms_milestone_deleted ON partnership_comms_milestones;
CREATE TRIGGER partnership_comms_milestone_deleted AFTER DELETE ON partnership_comms_milestones
  FOR EACH ROW EXECUTE FUNCTION on_comms_milestone_completed();

-- Finishing the task anywhere marks the milestone done. Only when a person finishes the task
-- directly (trigger depth 1); when the Calendar's Mark done closes it, nothing changes.
CREATE OR REPLACE FUNCTION on_comms_milestone_task_done() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_id := split_part(NEW.source_ref, ':', 2)::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  UPDATE partnership_comms_milestones
     SET completed_at = now()
   WHERE id = v_id AND completed_at IS NULL;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS comms_milestone_task_done ON tasks;
CREATE TRIGGER comms_milestone_task_done
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (
    NEW.status = 'done'
    AND OLD.status IS DISTINCT FROM 'done'
    AND NEW.source_system = 'crm'
    AND NEW.source_ref LIKE 'comms_milestone:%'
  )
  EXECUTE FUNCTION on_comms_milestone_task_done();

-- ─── 3. No separate first-time donor task ───────────────────────────────
-- Same as 0193's version, minus the task.
CREATE OR REPLACE FUNCTION create_donor_partner_from_gift(
  p_name             text,
  p_email            text,
  p_amount_above_10k boolean,
  p_source           text DEFAULT 'Givebutter',
  p_gift_date        date DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_id  uuid;
  owner   uuid := default_partnerships_owner();
BEGIN
  INSERT INTO partners (
    name, type, stage, owner_id, email, donor_tier,
    source, giving_method, active, first_gift_date
  ) VALUES (
    p_name, 'donor', 'active', owner, p_email, NULL,
    p_source, 'Givebutter', true, p_gift_date
  ) RETURNING id INTO new_id;

  IF p_amount_above_10k THEN
    UPDATE partners SET donor_tier = 'major' WHERE id = new_id;
  ELSE
    UPDATE partners SET donor_tier = 'first_time' WHERE id = new_id;
  END IF;

  RETURN new_id;
END $$;

UPDATE tasks SET status = 'done', updated_at = now()
 WHERE source_system = 'crm' AND source_ref LIKE 'first_time_donor:%' AND status <> 'done';

-- ─── 4. Newsletter reminders: one fixed rule, no Lead time setting ───────
-- A piece that isn't started yet comes up two weeks before its publish date, or 60 days
-- before for the Christmas TSM, Christmas cards and the Annual Report (writers need lining up
-- early). The comms tab and Partnerships Home use the same rule. The newsletter settings row
-- keeps only its owner ("Reminders go to"); cadence_days and lead_time_days are no longer read.
CREATE OR REPLACE FUNCTION emit_newsletter_reminder_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; v_owner uuid;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;

  SELECT owner_id INTO v_owner FROM partnership_recurring_settings WHERE kind = 'newsletter';
  IF v_owner IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id, title, publish_date
    FROM partnership_comms
    WHERE status = 'not_started'
      AND publish_date - CASE WHEN comm_type IN ('tsm_christmas', 'christmas_cards', 'annual_report')
                              THEN 60 ELSE 14 END <= current_date
  LOOP
    PERFORM emit_system_task(
      'crm', 'comms:' || r.id, v_owner,
      'Start ' || r.title || ' (publishes ' || to_char(r.publish_date, 'FMMonth FMDD, YYYY') || ')',
      'partnerships'::department, 'p3'::priority, r.publish_date
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Leaving Not started closes the reminder (as before). Going back to Not started reopens it,
-- since the emitter never reopens a done task.
CREATE OR REPLACE FUNCTION on_comm_status_changed() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'not_started' THEN
    PERFORM resolve_system_task('crm', 'comms:' || NEW.id);
  ELSE
    UPDATE tasks SET status = 'todo', updated_at = now()
     WHERE source_system = 'crm' AND source_ref = 'comms:' || NEW.id AND status = 'done';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partnership_comms_status_changed ON partnership_comms;
CREATE TRIGGER partnership_comms_status_changed
  AFTER UPDATE ON partnership_comms
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION on_comm_status_changed();

-- Finishing the reminder task anywhere counts as started (In progress), like Mark started.
CREATE OR REPLACE FUNCTION on_newsletter_task_done() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_id := split_part(NEW.source_ref, ':', 2)::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  UPDATE partnership_comms SET status = 'in_progress' WHERE id = v_id AND status = 'not_started';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS newsletter_task_done ON tasks;
CREATE TRIGGER newsletter_task_done
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (
    NEW.status = 'done'
    AND OLD.status IS DISTINCT FROM 'done'
    AND NEW.source_system = 'crm'
    AND NEW.source_ref LIKE 'comms:%'
  )
  EXECUTE FUNCTION on_newsletter_task_done();

COMMENT ON COLUMN partnership_recurring_settings.lead_time_days IS
  'UNUSED since 0212 (social) / 0221 (newsletter): both use fixed rules now. Kept as a record; safe to drop later.';
COMMENT ON COLUMN partnership_recurring_settings.cadence_days IS
  'UNUSED since 0212 (social) / 0221 (newsletter). Kept as a record; safe to drop later.';
