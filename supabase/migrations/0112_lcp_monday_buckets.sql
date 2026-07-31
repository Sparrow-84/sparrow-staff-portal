-- 0112_lcp_monday_buckets.sql
-- Monday Mentoring is restructured into 3 station "buckets" (Finance / Life Skills /
-- Mentoring), each with its own per-family note. Previously each family got one
-- blended note per Monday filing; splitting it by bucket is what actually fixes
-- the "9 disorganized notes" problem Shelly reported — one note per bucket per
-- family, not a mixed pile.
--
-- Also moves Monday Mentoring to a single SHARED session-log row per evening
-- (found-or-created by whichever staff opens it first) instead of one row per
-- staff member who files — that's the other half of the fix, since 3 staff
-- independently filing used to produce 3 separate, partially-overlapping rows
-- for the same night. Thursday Group and Ad-hoc are unaffected — they keep the
-- existing one-row-per-filing behavior.
--
-- Run after 0031. Schema reload after.

ALTER TABLE lcp_staff_notes
  ADD COLUMN IF NOT EXISTS bucket text CHECK (bucket IN ('finance', 'life_skills', 'mentoring'));

-- One note per (session, family, bucket) — lets any staff member open a bucket
-- and upsert straight into it without creating duplicates. Only applies to
-- bucketed (Monday) notes; Thursday/ad-hoc notes have bucket = null and are
-- unaffected (multiple per family per session log is fine there, as before).
CREATE UNIQUE INDEX IF NOT EXISTS lcp_staff_notes_bucket_uniq
  ON lcp_staff_notes(session_log_id, family_id, bucket)
  WHERE bucket IS NOT NULL;

CREATE INDEX IF NOT EXISTS lcp_staff_notes_session_log_idx ON lcp_staff_notes(session_log_id);
