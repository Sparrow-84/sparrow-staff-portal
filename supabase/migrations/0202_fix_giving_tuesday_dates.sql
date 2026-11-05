-- Giving Tuesday was seeded using "1st Tuesday of November + 14 days" (the 3rd Tuesday),
-- which is 1-2 weeks earlier than the real Giving Tuesday (the Tuesday right after the
-- 4th Thursday of November / Thanksgiving). Recomputes any already-seeded row to the
-- correct date. Idempotent: only touches rows that are actually wrong, using the same
-- formula for any year, so re-running this after new years get (correctly) seeded is a
-- no-op.

UPDATE partnership_comms
SET publish_date = (
  -- 4th Thursday of November: 1st Thursday + 21 days, then +5 days to the following Tuesday.
  (make_date(year, 11, 1) + (((4 - EXTRACT(DOW FROM make_date(year, 11, 1))::int + 7) % 7) + 21) * INTERVAL '1 day')
  + INTERVAL '5 days'
)::date
WHERE comm_type = 'giving_tuesday'
  AND publish_date <> (
    (make_date(year, 11, 1) + (((4 - EXTRACT(DOW FROM make_date(year, 11, 1))::int + 7) % 7) + 21) * INTERVAL '1 day')
    + INTERVAL '5 days'
  )::date;
