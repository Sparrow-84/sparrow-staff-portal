-- 2026 was seeded before (a) the comm_type enum had 'sparrow_spotlight' at all (see 0203)
-- and (b) the Annual Report's date became relative to the January TSM issue instead of a
-- flat Jan 15. Because seedCommsForYear() only ever fills in a year that has zero rows,
-- 2026 never got its 12 Spotlight entries or its January TSM issue, and its Annual Report
-- kept the stale Jan 15 date. One-time backfill for this already-seeded year; computed with
-- the same 2nd/4th-Thursday + holiday-shift rules as the app
-- (src/lib/partnerships-tabs.ts), verified against the live database before writing this.
-- Idempotent: every statement is a no-op if already applied.

-- The missing January TSM issue (2nd Thursday of January 2026 = Jan 8; no holiday collision).
INSERT INTO partnership_comms (year, comm_type, title, publish_date, status, is_financial_ask, notes)
SELECT 2026, 'tsm', 'TSM — January', '2026-01-08', 'not_started', false, null
WHERE NOT EXISTS (
  SELECT 1 FROM partnership_comms WHERE year = 2026 AND comm_type = 'tsm' AND title = 'TSM — January'
);

-- The 12 missing Sparrow Spotlight entries (4th Thursday of each month; November shifts
-- 2 days earlier to Nov 24 since Nov 26, 2026 is Thanksgiving).
INSERT INTO partnership_comms (year, comm_type, title, publish_date, status, is_financial_ask, notes)
SELECT 2026, 'sparrow_spotlight', v.title, v.publish_date::date, 'not_started', false, null
FROM (VALUES
  ('The Sparrow Spotlight — January',   '2026-01-22'),
  ('The Sparrow Spotlight — February',  '2026-02-26'),
  ('The Sparrow Spotlight — March',     '2026-03-26'),
  ('The Sparrow Spotlight — April',     '2026-04-23'),
  ('The Sparrow Spotlight — May',       '2026-05-28'),
  ('The Sparrow Spotlight — June',      '2026-06-25'),
  ('The Sparrow Spotlight — July',      '2026-07-23'),
  ('The Sparrow Spotlight — August',    '2026-08-27'),
  ('The Sparrow Spotlight — September', '2026-09-24'),
  ('The Sparrow Spotlight — October',   '2026-10-22'),
  ('The Sparrow Spotlight — November',  '2026-11-24'),
  ('The Sparrow Spotlight — December',  '2026-12-24')
) AS v(title, publish_date)
WHERE NOT EXISTS (
  SELECT 1 FROM partnership_comms
  WHERE year = 2026 AND comm_type = 'sparrow_spotlight' AND title = v.title
);

-- Correct the Annual Report's stale hardcoded Jan 15 date to January TSM (Jan 8) + 14 days.
UPDATE partnership_comms
SET publish_date = '2026-01-22'
WHERE year = 2026 AND comm_type = 'annual_report' AND publish_date <> '2026-01-22';
