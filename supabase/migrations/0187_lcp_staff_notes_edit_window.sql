-- Migration 0187: any LCP-full staff can edit a session note, but notes lock
-- 30 days after they're created.
--
-- Susanna's call (2026-10-21): individual (non-bucket) session notes were
-- author-only editable in the UI -- Susanna could see but not fix Audrey's
-- notes. That restriction was never actually enforced here at the RLS level
-- (staff_notes_all already granted full read/write to any lcp_is_full()
-- staff member, see 0005_lcp.sql) -- it was purely a UI gate, now removed
-- client-side. In exchange, a real safety net: nobody (not even the
-- original author) can edit a note more than 30 days after it was created,
-- so old notes from months or years ago can't get silently rewritten.
-- Applies uniformly to every lcp_staff_notes row, bucket or not -- bucket
-- notes were already shared/editable with no time limit before this, so
-- this is the first time they get a lock too.
--
-- created_at is the anchor, not updated_at -- editing a note must never
-- reset its own clock, or the lock would never actually close.
--
-- Splits the old single `staff_notes_all` (FOR ALL) policy into one policy
-- per action so the time restriction only applies to UPDATE -- SELECT/INSERT
-- are unaffected, and there's no DELETE capability in the app today but one
-- is kept (unrestricted) for parity with the original grant.

DROP POLICY IF EXISTS staff_notes_all ON lcp_staff_notes;

CREATE POLICY staff_notes_select ON lcp_staff_notes FOR SELECT TO authenticated
  USING (lcp_is_full());

CREATE POLICY staff_notes_insert ON lcp_staff_notes FOR INSERT TO authenticated
  WITH CHECK (lcp_is_full());

CREATE POLICY staff_notes_update ON lcp_staff_notes FOR UPDATE TO authenticated
  USING (lcp_is_full() AND created_at > now() - interval '30 days')
  WITH CHECK (lcp_is_full() AND created_at > now() - interval '30 days');

CREATE POLICY staff_notes_delete ON lcp_staff_notes FOR DELETE TO authenticated
  USING (lcp_is_full());
