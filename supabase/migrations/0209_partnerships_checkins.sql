-- Partnerships check-ins + Home reminders. Agreed with Susanna 2026-11-05.
--
-- 1. Check-ins get their own table. A record used to have one "Needs additional touchpoint"
--    (partners.needs_additional_touchpoint / additional_touchpoint_label / _due). Now a record
--    can have several, each its own kind ("MOU check-in", "Annual site visit"...), each with
--    its own due date and its own task. Existing ones are copied over; the old columns keep
--    their values as a backup.
-- 2. Marking one check-in Done closes only that check-in's task, logs it in the record's
--    touchpoint history, and (optionally) schedules the next one of the same kind
--    (complete_partner_checkin). Logging an ordinary touchpoint no longer closes anything.
-- 3. Each due date gets its own task ref ('checkin:<id>:<due>'), so moving a date or
--    scheduling next year's brings a fresh task back. Moving a date, finishing or deleting
--    a check-in closes the old task.
-- 4. A check-in on a record with no owner goes to the Partnerships room admin
--    (profiles.sop_admin_rooms contains 'partnerships'), like Resident Services (0206).
-- 5. partnerships_open_reminders(): every open system reminder in the Partnerships
--    department, for anyone with room access, so Partnerships Home can list all of them
--    (prayer check-ins, duplicate donors, comms milestones...). tasks' own RLS only shows a
--    person their own tasks.
-- 7. Removing Volunteer from a record no longer wipes its volunteer kinds (drops 0207's
--    clearing trigger), so nothing is lost if Volunteer is added back.
-- 6. Clears the last leftover Organization values (field scrapped in the rebuild): three
--    repeated the record's own name, and Brittany Wenger's ("Corpus Christi") Susanna said
--    to delete. The column itself stays.
--
-- Idempotent.

-- ─── 1. Check-ins table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_checkins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  due_date    date,
  done_at     timestamptz,
  done_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_checkins_open_idx ON partner_checkins(partner_id) WHERE done_at IS NULL;

-- Same reach as the record itself (partner_contacts, 0200).
ALTER TABLE partner_checkins ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY partner_checkins_all ON partner_checkins
    FOR ALL TO authenticated
    USING (partnerships_has_access()
           OR EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()))
    WITH CHECK (partnerships_has_access()
           OR EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Copy existing check-ins over (skips records with neither a label nor a date). Nothing is
-- cleared: the old columns keep their values as a backup (nothing reads them once this has
-- run). A re-run copies nothing twice: it skips a record that already has any check-in.
INSERT INTO partner_checkins (partner_id, label, due_date, created_by)
SELECT p.id,
       COALESCE(NULLIF(btrim(p.additional_touchpoint_label), ''), 'Check-in'),
       p.additional_touchpoint_due,
       NULL
FROM partners p
WHERE p.needs_additional_touchpoint
  AND (NULLIF(btrim(p.additional_touchpoint_label), '') IS NOT NULL OR p.additional_touchpoint_due IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM partner_checkins c WHERE c.partner_id = p.id);

-- Old one-per-record tasks still open: move each onto its new check-in (keeps its notes,
-- assignee and history) instead of closing it and making a fresh one.
UPDATE tasks t
SET source_ref = 'checkin:' || c.id || ':' || c.due_date, updated_at = now()
FROM partner_checkins c
WHERE t.source_system = 'crm'
  AND t.status <> 'done'
  AND t.source_ref = 'touchpoint:' || c.partner_id
  AND c.done_at IS NULL
  AND c.due_date IS NOT NULL;

-- ─── 1b. Removing Volunteer keeps the volunteer kinds ───────────────
-- 0207 wiped Prayer/LCP/General when Volunteer came off a record. Now they're kept, so
-- adding Volunteer back restores them; they're only shown (and the Prayer roster only
-- counts them) while the record is a Volunteer.
DROP TRIGGER IF EXISTS partners_clear_volunteer_sub_categories_trg ON partners;

-- ─── 2. Logging a touchpoint no longer closes a check-in ────────────
CREATE OR REPLACE FUNCTION on_touchpoint_logged()
RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE partners
     SET last_touchpoint_at = greatest(coalesce(last_touchpoint_at, NEW.occurred_on), NEW.occurred_on),
         updated_at = now()
   WHERE id = NEW.partner_id;
  RETURN NEW;
END $$;

-- ─── 3. Close a check-in's task when it's done, moved or deleted ────
CREATE OR REPLACE FUNCTION on_partner_checkin_changed()
RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM resolve_system_task('crm', 'checkin:' || OLD.id || ':' || COALESCE(OLD.due_date::text, ''));
  ELSIF NEW.done_at IS NOT NULL OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    PERFORM resolve_system_task('crm', 'checkin:' || OLD.id || ':' || COALESCE(OLD.due_date::text, ''));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS partner_checkin_changed ON partner_checkins;
CREATE TRIGGER partner_checkin_changed
  AFTER UPDATE OR DELETE ON partner_checkins
  FOR EACH ROW EXECUTE FUNCTION on_partner_checkin_changed();

-- Done: closes this one check-in (trigger above closes its task), logs it in the record's
-- touchpoint history, and schedules the next one of the same kind when a date is given.
CREATE OR REPLACE FUNCTION complete_partner_checkin(p_checkin uuid, p_next_due date DEFAULT NULL)
RETURNS uuid
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE c partner_checkins; v_next uuid;
BEGIN
  UPDATE partner_checkins SET done_at = now(), done_by = auth.uid()
  WHERE id = p_checkin AND done_at IS NULL
  RETURNING * INTO c;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'Check-in not found or already done';
  END IF;

  INSERT INTO partner_touchpoints (partner_id, logged_by, method, occurred_on, summary)
  VALUES (c.partner_id, auth.uid(), 'other', current_date, c.label || ' — done');

  IF p_next_due IS NOT NULL THEN
    INSERT INTO partner_checkins (partner_id, label, due_date)
    VALUES (c.partner_id, c.label, p_next_due)
    RETURNING id INTO v_next;
  END IF;
  RETURN v_next;
END $$;
GRANT EXECUTE ON FUNCTION complete_partner_checkin(uuid, date) TO authenticated;

-- ─── 4. Emit due check-ins (unowned → room admin) ───────────────────
CREATE OR REPLACE FUNCTION emit_due_touchpoint_tasks()
RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; v_admin uuid;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;

  SELECT p.id INTO v_admin FROM profiles p
  WHERE p.active AND 'partnerships' = ANY (p.sop_admin_rooms)
  ORDER BY p.full_name
  LIMIT 1;

  FOR r IN
    SELECT c.id, c.label, c.due_date, p.name, COALESCE(p.owner_id, v_admin) AS assignee
    FROM partner_checkins c
    JOIN partners p ON p.id = c.partner_id
    WHERE p.active
      AND c.done_at IS NULL
      AND c.due_date IS NOT NULL
      AND c.due_date <= current_date
      AND COALESCE(p.owner_id, v_admin) IS NOT NULL
  LOOP
    PERFORM emit_system_task(
      'crm', 'checkin:' || r.id || ':' || r.due_date, r.assignee,
      r.label || ' — ' || r.name,
      'partnerships'::department, 'p2'::priority, r.due_date
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ─── 5. Every open Partnerships reminder, for Home ──────────────────
CREATE OR REPLACE FUNCTION partnerships_open_reminders()
RETURNS TABLE (id uuid, title text, due_date date, source_ref text, assignee_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.title, t.due_date, t.source_ref, t.assignee_id
  FROM tasks t
  WHERE partnerships_has_access()
    AND t.department = 'partnerships'
    AND t.source_system = 'crm'
    AND t.source_ref IS NOT NULL
    AND t.status <> 'done';
$$;
GRANT EXECUTE ON FUNCTION partnerships_open_reminders() TO authenticated;

-- ─── 6. Clear leftover Organization values ──────────────────────────
UPDATE partners SET organization = NULL WHERE organization IS NOT NULL;
