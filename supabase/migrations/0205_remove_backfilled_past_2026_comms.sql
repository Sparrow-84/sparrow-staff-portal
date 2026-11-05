-- 0204 backfilled every 2026 Sparrow Spotlight issue plus the January TSM issue as
-- 'not_started'. Spotlight only became a real recurring piece in fall 2026, so the
-- January–October issues never existed, and the January TSM issue predates the comms
-- tracker. Left in place they show up as 11 "overdue" items on Partnerships Home.
-- Removes only those backfilled past rows, and only while still untouched
-- ('not_started'); November and December Spotlight stay. Milestones cascade.
-- Idempotent: a no-op once applied.

DELETE FROM partnership_comms
WHERE year = 2026
  AND status = 'not_started'
  AND (
    (comm_type = 'sparrow_spotlight' AND publish_date < '2026-11-01')
    OR (comm_type = 'tsm' AND title = 'TSM — January')
  );
