-- Homework's "By Participant" view groups by which session type assigned it
-- (Monday / Thursday / Ad-hoc) instead of the 5 life-area labels. Reuses the
-- existing session_log_type enum rather than inventing a parallel one.
-- Existing rows are test data slated for a separate wipe, so left null --
-- no backfill attempted here.

ALTER TABLE lcp_homework ADD COLUMN IF NOT EXISTS session_type session_log_type;
