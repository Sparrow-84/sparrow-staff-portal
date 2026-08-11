-- Migration 0149: optional reason on a late/no-show attendance mark.
--
-- Shelly's request (2026-08-10): wants to eventually see a participant's
-- attendance over the year including why she was late/absent (e.g. "sick 45
-- times"). No categorization/tally logic in the app -- Susanna's call is a
-- plain free-text field staff jot in the moment, that Shelly can skim (or
-- copy/paste elsewhere to tally herself) rather than the app doing analysis.
-- This only captures reasons going forward; there's no historical data to
-- backfill.

ALTER TABLE lcp_session_attendance ADD COLUMN IF NOT EXISTS reason text;
