-- ============================================================
-- grant-prospect-orphan-calendar-cleanup.sql
-- Follow-up to migration 0154. Its one-time sweep removed the "Test
-- Grant" orphaned calendar event correctly, but two more — from
-- already-deleted grant prospects — are still on the calendar as of
-- 2026-08-13 (confirmed via direct DB check: grant_prospects is
-- currently empty, yet these two events still reference prospect IDs
-- from it). Most likely 0154's trailing DELETE statements didn't run
-- the same time its CREATE TRIGGER statements did — same pattern as
-- past migrations whose seed/cleanup tail didn't survive a manual run.
--
-- Generic NOT EXISTS check, not hardcoded IDs — safe to re-run.
-- ============================================================

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
