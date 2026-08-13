-- ============================================================
-- 0154_grant_calendar_cleanup_on_delete.sql
-- Fixes: deleting a grant or grant prospect never cleaned up the
-- calendar event(s) or reminder task emit_grant_calendar_events()/
-- emit_grant_reminder_tasks() (0139/0145) had created for it — those
-- functions only ever INSERT/UPDATE for rows that still exist, they
-- never delete for rows that don't. Found live: the deleted "Test
-- Grant -- safe to delete" grant left a "Certification due" event
-- sitting on the calendar for Aug 15, and two deleted grant prospects
-- left their own "Application opens"/"Application deadline" events
-- behind the same way.
--
-- Fix: a BEFORE DELETE trigger on each table removes its own
-- calendar event(s) (and resolves any open reminder task) using the
-- exact same source_system/source_ref key the emit functions write —
-- so it also works correctly for real future deletions, not just
-- this cleanup.
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_grant_calendar_on_delete() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.certification_due_date IS NOT NULL THEN
    DELETE FROM calendar_events
      WHERE source_system = 'grant_certification'
        AND source_ref = 'grant_certification:' || OLD.id || ':' || OLD.certification_due_date::text;
    PERFORM resolve_system_task('grant_certification', 'grant_certification:' || OLD.id || ':' || OLD.certification_due_date::text);
  END IF;
  RETURN OLD;
END $$;

DO $$ BEGIN
  CREATE TRIGGER grants_cleanup_calendar_on_delete
    BEFORE DELETE ON grants
    FOR EACH ROW EXECUTE FUNCTION cleanup_grant_calendar_on_delete();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION cleanup_grant_prospect_calendar_on_delete() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.application_opens IS NOT NULL THEN
    DELETE FROM calendar_events
      WHERE source_system = 'grant_prospect_opens'
        AND source_ref = 'grant_prospect_opens:' || OLD.id || ':' || OLD.application_opens::text;
  END IF;
  IF OLD.application_deadline IS NOT NULL THEN
    DELETE FROM calendar_events
      WHERE source_system = 'grant_prospect_deadline'
        AND source_ref = 'grant_prospect_deadline:' || OLD.id || ':' || OLD.application_deadline::text;
    PERFORM resolve_system_task('grant_prospect_deadline', 'grant_prospect_deadline:' || OLD.id || ':' || OLD.application_deadline::text);
  END IF;
  RETURN OLD;
END $$;

DO $$ BEGIN
  CREATE TRIGGER grant_prospects_cleanup_calendar_on_delete
    BEFORE DELETE ON grant_prospects
    FOR EACH ROW EXECUTE FUNCTION cleanup_grant_prospect_calendar_on_delete();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- One-time sweep for orphans that already exist (the Test Grant event
-- Susanna spotted on the calendar, plus two from already-deleted grant
-- prospects found during the same check). Generic NOT EXISTS check, not
-- hardcoded IDs — safe to re-run, only ever removes genuinely orphaned rows.
DELETE FROM calendar_events ce
WHERE ce.source_system = 'grant_certification'
  AND NOT EXISTS (
    SELECT 1 FROM grants g
    WHERE ce.source_ref = 'grant_certification:' || g.id || ':' || g.certification_due_date::text
  );

DELETE FROM calendar_events ce
WHERE ce.source_system = 'grant_prospect_opens'
  AND NOT EXISTS (
    SELECT 1 FROM grant_prospects p
    WHERE ce.source_ref = 'grant_prospect_opens:' || p.id || ':' || p.application_opens::text
  );

DELETE FROM calendar_events ce
WHERE ce.source_system = 'grant_prospect_deadline'
  AND NOT EXISTS (
    SELECT 1 FROM grant_prospects p
    WHERE ce.source_ref = 'grant_prospect_deadline:' || p.id || ':' || p.application_deadline::text
  );
