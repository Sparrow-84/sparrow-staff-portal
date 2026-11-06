-- Sparrow Staff Portal — Collateral: one "Next review" date per item (check-in style)
-- Run AFTER 0210_partnerships_reminder_messages.sql.
--
-- Decided with the product owner 2026-11-06 while writing the Collateral tab guide:
--   * Cadence + Lead time + a hidden last-reviewed date were three settings producing one due
--     date. Replaced by a single next_review_at per item, the same habit as Directory
--     check-ins: "Mark reviewed" asks when the next review is (default 6 months out).
--     Every item now comes up two weeks before its Next review date — no per-item lead time.
--   * New optional `link` column: where the editable source file (or its folder) lives.
--   * Bug fix: every review task for an item reused one source_ref ('collateral_review:<id>'),
--     and emit_system_task never reopens a done task, so after the first review an item never
--     sent its owner another task. Refs are now per review date, like check-ins (0209).
--   * Changing an item's owner now moves its open task; moving its date or archiving it removes
--     the stale open task (the emitter makes a fresh one for the new date).
--   * Finishing the review task anywhere (Incoming Tasks, Home) now counts as reviewed: it sets
--     Last reviewed to today and Next review six months out.
-- cadence_days, lead_time_days, review_cycle and needs_attention are kept (no longer used by
-- the app) so nothing is lost; safe to drop later.

-- ─── 1. Columns ───────────────────────────────────────────────────────
ALTER TABLE partnership_collateral ADD COLUMN IF NOT EXISTS next_review_at date;
ALTER TABLE partnership_collateral ADD COLUMN IF NOT EXISTS link text;

UPDATE partnership_collateral
   SET next_review_at = last_reviewed_at + COALESCE(cadence_days, 182)
 WHERE next_review_at IS NULL;

ALTER TABLE partnership_collateral ALTER COLUMN next_review_at SET NOT NULL;
ALTER TABLE partnership_collateral ALTER COLUMN cadence_days DROP NOT NULL;
ALTER TABLE partnership_collateral ALTER COLUMN lead_time_days DROP NOT NULL;

COMMENT ON COLUMN partnership_collateral.next_review_at IS
  'Required. When this item is next due for review. It comes up on Partnerships Home and in the owner''s tasks two weeks before. Mark reviewed sets a new one.';
COMMENT ON COLUMN partnership_collateral.link IS
  'Optional. Link to the editable source file, or to its folder when there are several versions.';
COMMENT ON COLUMN partnership_collateral.cadence_days IS
  'UNUSED since 0211 (replaced by next_review_at). Kept as a record; safe to drop later.';
COMMENT ON COLUMN partnership_collateral.lead_time_days IS
  'UNUSED since 0211 (every item now comes up two weeks ahead). Kept as a record; safe to drop later.';
COMMENT ON COLUMN partnership_collateral.needs_attention IS
  'UNUSED since 0211 (flag removed from the app; set Next review to today instead). Safe to drop later.';

-- ─── 2. Carry any open old-style task onto the new per-date ref ─────────
UPDATE tasks t
   SET source_ref = 'collateral_review:' || c.id || ':' || c.next_review_at, updated_at = now()
  FROM partnership_collateral c
 WHERE t.source_system = 'crm'
   AND t.source_ref = 'collateral_review:' || c.id
   AND t.status <> 'done';

-- ─── 3. Emitter: one task per item per review date, two weeks ahead ─────
CREATE OR REPLACE FUNCTION emit_collateral_review_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT id, item_name, owner_id, next_review_at
    FROM partnership_collateral
    WHERE active
      AND owner_id IS NOT NULL
      AND next_review_at - 14 <= current_date
  LOOP
    PERFORM emit_system_task(
      'crm', 'collateral_review:' || r.id || ':' || r.next_review_at, r.owner_id,
      'Review collateral — ' || r.item_name,
      'partnerships'::department, 'p3'::priority, r.next_review_at
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ─── 4. Item changes keep its open task in step ───────────────────────
CREATE OR REPLACE FUNCTION on_collateral_reviewed() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prefix text := 'collateral_review:' || NEW.id || ':%';
BEGIN
  -- Reviewed: the open task is done.
  IF NEW.last_reviewed_at > OLD.last_reviewed_at THEN
    UPDATE tasks SET status = 'done', updated_at = now()
     WHERE source_system = 'crm' AND source_ref LIKE v_prefix AND status <> 'done';
  END IF;
  -- Date moved or item archived: the open task is stale. Removed rather than marked done, so
  -- it never shows as finished work and never blocks a fresh task for the same date.
  IF NEW.next_review_at IS DISTINCT FROM OLD.next_review_at OR (OLD.active AND NOT NEW.active) THEN
    DELETE FROM tasks
     WHERE source_system = 'crm' AND source_ref LIKE v_prefix AND status <> 'done';
  END IF;
  -- New owner: hand the open task over.
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    UPDATE tasks SET assignee_id = NEW.owner_id, updated_at = now()
     WHERE source_system = 'crm' AND source_ref LIKE v_prefix AND status <> 'done';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partnership_collateral_reviewed ON partnership_collateral;
CREATE TRIGGER partnership_collateral_reviewed AFTER UPDATE ON partnership_collateral
  FOR EACH ROW WHEN (
    OLD.last_reviewed_at IS DISTINCT FROM NEW.last_reviewed_at
    OR OLD.next_review_at IS DISTINCT FROM NEW.next_review_at
    OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
    OR OLD.active IS DISTINCT FROM NEW.active
  )
  EXECUTE FUNCTION on_collateral_reviewed();

-- ─── 5. Finishing the task anywhere counts as reviewed ─────────────────
-- Only when a person finishes the task directly (trigger depth 1). When the app's own
-- "Mark reviewed" closes it, the item already says reviewed today and nothing changes.
CREATE OR REPLACE FUNCTION on_collateral_review_task_done() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_id := split_part(NEW.source_ref, ':', 2)::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;                                  -- pre-0080 date-style refs: nothing to update
  END;
  UPDATE partnership_collateral
     SET last_reviewed_at = current_date,
         next_review_at   = (current_date + interval '6 months')::date
   WHERE id = v_id AND active AND last_reviewed_at < current_date;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS collateral_review_task_done ON tasks;
CREATE TRIGGER collateral_review_task_done
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (
    NEW.status = 'done'
    AND OLD.status IS DISTINCT FROM 'done'
    AND NEW.source_system = 'crm'
    AND NEW.source_ref LIKE 'collateral_review:%'
  )
  EXECUTE FUNCTION on_collateral_review_task_done();
