-- 0113_lcp_homework_completed_at.sql
-- Homework had no timestamp for when it was marked complete (goals already
-- have met_at for the equivalent). Needed for the new Goals/Homework History
-- tab on the Session Log home page's By Participant view, which shows
-- "Assigned [date]" / "Completed [date]" per item.
--
-- Run any time. Schema reload after.

ALTER TABLE lcp_homework ADD COLUMN IF NOT EXISTS completed_at timestamptz;
