-- Sparrow Staff Portal — Meaningful Connections: follow-up reminder fixes (Events tab)
-- Run AFTER 0214_grant_updates.sql. Safe to run more than once.
--
-- Decided with the product owner 2026-11-11 while writing the Events tab guide:
--   * Every connection always has a next step: a follow-up date, a Directory record, or the
--     archive. Ticking Done (on the tab or Home) asks which. That part is frontend only.
--   * Bug fix: every follow-up task for a connection reused one source_ref
--     ('connection_followup:<id>'), and emit_system_task never reopens a done task, so a
--     second follow-up on the same connection never sent its owner a task. Refs are now per
--     follow-up date, like check-ins (0209) and collateral (0211).
--   * Follow-ups come up one week before their date, in the owner's tasks and on Home (Home
--     already showed them a week ahead; the task used to wait for the day itself).
--   * A connection with no owner sends its reminder to the Partnerships room admin, the same
--     as check-ins (0209).
--   * Changing the owner moves the open task; moving the date removes the stale open task
--     (the emitter makes a fresh one for the new date); deleting the connection removes it.
--   * Finishing the task anywhere (Incoming Tasks, Home) marks the follow-up done. The
--     connection then shows on Home as needing a next step until someone picks one.
-- lead_time_days is kept (no longer used) so nothing is lost; safe to drop later.

COMMENT ON COLUMN partnership_connections.lead_time_days IS
  'UNUSED since 0215 (every follow-up now comes up one week ahead). Kept as a record; safe to drop later.';

-- ─── 1. Carry any open old-style task onto the new per-date ref ─────────
UPDATE tasks t
   SET source_ref = 'connection_followup:' || c.id || ':' || c.followup_due, updated_at = now()
  FROM partnership_connections c
 WHERE t.source_system = 'crm'
   AND t.source_ref = 'connection_followup:' || c.id
   AND t.status <> 'done'
   AND c.followup_due IS NOT NULL;

-- ─── 2. The room admin (first active person with Partnerships SOP admin) ─
CREATE OR REPLACE FUNCTION partnerships_room_admin_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM profiles p
  WHERE p.active AND 'partnerships' = ANY (p.sop_admin_rooms)
  ORDER BY p.full_name
  LIMIT 1;
$$;

-- ─── 3. Emitter: one task per connection per follow-up date, a week ahead ─
CREATE OR REPLACE FUNCTION emit_overdue_connection_followups() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; v_admin uuid;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;
  v_admin := partnerships_room_admin_id();

  FOR r IN
    SELECT c.id, c.name, c.followup_due, COALESCE(c.owner_id, v_admin) AS assignee, e.event_name
    FROM   partnership_connections c
    LEFT JOIN partnership_events e ON e.id = c.event_id
    WHERE  c.followup_done = false
      AND  c.archived_at IS NULL
      AND  c.followup_due IS NOT NULL
      AND  c.followup_due - 7 <= current_date
      AND  COALESCE(c.owner_id, v_admin) IS NOT NULL
  LOOP
    PERFORM emit_system_task(
      'crm',
      'connection_followup:' || r.id || ':' || r.followup_due,
      r.assignee,
      'Follow up with ' || r.name || CASE WHEN r.event_name IS NOT NULL THEN ' from ' || r.event_name ELSE '' END,
      'partnerships'::department,
      'p2'::priority,
      r.followup_due
    );
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;

-- ─── 4. Connection changes keep its open task in step ─────────────────
CREATE OR REPLACE FUNCTION resolve_connection_followup_task() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text := 'connection_followup:' || NEW.id || ':%';
  v_legacy text := 'connection_followup:' || NEW.id;
BEGIN
  -- Followed up, or archived / moved to the Directory: the open task is done.
  IF (NEW.followup_done AND NOT OLD.followup_done)
     OR (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL) THEN
    UPDATE tasks SET status = 'done', updated_at = now()
     WHERE source_system = 'crm'
       AND (source_ref LIKE v_prefix OR source_ref = v_legacy)
       AND status <> 'done';
  -- Date moved or cleared: the open task for the old date is stale. Removed rather than
  -- marked done, so it never shows as finished work.
  ELSIF NEW.followup_due IS DISTINCT FROM OLD.followup_due THEN
    DELETE FROM tasks
     WHERE source_system = 'crm'
       AND (source_ref LIKE v_prefix OR source_ref = v_legacy)
       AND source_ref <> 'connection_followup:' || NEW.id || ':' || COALESCE(NEW.followup_due::text, '')
       AND status <> 'done';
  END IF;
  -- New owner (or none, which means the room admin): hand the open task over.
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    UPDATE tasks SET assignee_id = COALESCE(NEW.owner_id, partnerships_room_admin_id()), updated_at = now()
     WHERE source_system = 'crm'
       AND (source_ref LIKE v_prefix OR source_ref = v_legacy)
       AND status <> 'done';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partnership_connections_resolve_followup ON partnership_connections;
CREATE TRIGGER partnership_connections_resolve_followup
  AFTER UPDATE ON partnership_connections
  FOR EACH ROW WHEN (
    OLD.followup_done IS DISTINCT FROM NEW.followup_done
    OR OLD.archived_at IS DISTINCT FROM NEW.archived_at
    OR OLD.followup_due IS DISTINCT FROM NEW.followup_due
    OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
  )
  EXECUTE FUNCTION resolve_connection_followup_task();

-- Deleting a connection removes its open task.
CREATE OR REPLACE FUNCTION on_connection_deleted() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM tasks
   WHERE source_system = 'crm'
     AND (source_ref LIKE 'connection_followup:' || OLD.id || ':%' OR source_ref = 'connection_followup:' || OLD.id)
     AND status <> 'done';
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS partnership_connections_deleted ON partnership_connections;
CREATE TRIGGER partnership_connections_deleted
  AFTER DELETE ON partnership_connections
  FOR EACH ROW EXECUTE FUNCTION on_connection_deleted();

-- ─── 5. Finishing the task anywhere marks the follow-up done ────────────
-- Only when a person finishes the task directly (trigger depth 1). When the app's own Done
-- closes it, the connection already says done and nothing changes.
CREATE OR REPLACE FUNCTION on_connection_followup_task_done() RETURNS trigger
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
  UPDATE partnership_connections
     SET followup_done = true
   WHERE id = v_id AND NOT followup_done;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS connection_followup_task_done ON tasks;
CREATE TRIGGER connection_followup_task_done
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (
    NEW.status = 'done'
    AND OLD.status IS DISTINCT FROM 'done'
    AND NEW.source_system = 'crm'
    AND NEW.source_ref LIKE 'connection_followup:%'
  )
  EXECUTE FUNCTION on_connection_followup_task_done();
