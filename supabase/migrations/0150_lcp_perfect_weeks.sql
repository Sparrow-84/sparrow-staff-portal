-- Migration 0150: LCP Housing Savings -- switch from staff-answered calendar
-- months to system-computed weeks.
--
-- Shelly's actual rule (clarified 2026-08-11): every 4 "perfect" weeks (any
-- order, don't need to be consecutive or in the same calendar month) = $100.
-- A perfect week = on-time attendance both Monday Mentoring AND Thursday
-- Group that week, AND every homework item due that week completed by its
-- due date. This is fully objective and derivable from data staff already
-- enter (lcp_session_attendance, lcp_homework) -- so unlike the old monthly
-- system, nothing needs to be manually answered from memory anymore.
--
-- A week with no Monday/Thursday session logged at all (holiday, cancelled
-- group night) is skipped entirely -- it never counts for or against the 4
-- (Susanna's call, 2026-08-11).
--
-- Existing progress under the old month-based system is frozen, not
-- recalculated -- `housing_savings_legacy_cents` snapshots each family's
-- current total at migration time, and the new weekly system only ever
-- adds on top of that from here forward. `lcp_housing_savings_months` is
-- left in place as historical record; nothing in this migration touches it.
--
-- `housing_savings_announced_cents` tracks what staff have already been
-- shown via the LcpHome "just earned $100" FYI card (a quiet, non-todo
-- notice per Susanna, not a task) -- separate from the real running total
-- so a dismiss action can't be confused with an actual balance change.

CREATE TABLE IF NOT EXISTS lcp_perfect_weeks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start   date        NOT NULL, -- the Monday of the evaluated week
  complete     boolean     NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, week_start)
);
CREATE INDEX IF NOT EXISTS lcp_perfect_weeks_family_idx ON lcp_perfect_weeks(family_id);

ALTER TABLE lcp_perfect_weeks ENABLE ROW LEVEL SECURITY;

-- Read-only for staff -- this is a computed audit trail, not staff-entered
-- data, so (unlike lcp_housing_savings_months) there's deliberately no
-- insert/update policy at all. Only recompute_lcp_perfect_weeks() (SECURITY
-- DEFINER, bypasses RLS) ever writes to it.
DO $$ BEGIN
  CREATE POLICY "lcp_perfect_weeks_select" ON lcp_perfect_weeks
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND lcp_role IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE families ADD COLUMN IF NOT EXISTS housing_savings_legacy_cents integer;
ALTER TABLE families ADD COLUMN IF NOT EXISTS housing_savings_announced_cents integer;
UPDATE families SET housing_savings_legacy_cents = COALESCE(housing_savings_cents, 0) WHERE housing_savings_legacy_cents IS NULL;
UPDATE families SET housing_savings_announced_cents = COALESCE(housing_savings_cents, 0) WHERE housing_savings_announced_cents IS NULL;
ALTER TABLE families ALTER COLUMN housing_savings_legacy_cents SET NOT NULL;
ALTER TABLE families ALTER COLUMN housing_savings_legacy_cents SET DEFAULT 0;
ALTER TABLE families ALTER COLUMN housing_savings_announced_cents SET NOT NULL;
ALTER TABLE families ALTER COLUMN housing_savings_announced_cents SET DEFAULT 0;

-- Fire-and-forget on LcpHome load, same idiom as emit_lcp_family_birthday_events
-- / emit_stat_holiday_events. Evaluates every fully-elapsed week (Mon-Sun)
-- since each active family's move-in (or join date, if no move-in yet) up
-- through the last complete week, skipping any week with no session logged,
-- then re-derives each family's cached total from the legacy base + $100
-- per 4 complete weeks.
CREATE OR REPLACE FUNCTION recompute_lcp_perfect_weeks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n int := 0;
BEGIN
  INSERT INTO lcp_perfect_weeks (family_id, week_start, complete)
  SELECT
    f.id,
    w.week_start,
    NOT EXISTS (
      SELECT 1 FROM lcp_session_attendance sa
      JOIN lcp_session_logs sl ON sl.id = sa.session_log_id
      WHERE sa.family_id = f.id
        AND sl.session_type IN ('monday_mentoring', 'thursday_group')
        AND date_trunc('week', sl.session_date)::date = w.week_start
        AND sa.status <> 'on_time'
    )
    AND NOT EXISTS (
      SELECT 1 FROM lcp_homework h
      WHERE h.family_id = f.id
        AND h.due_date BETWEEN w.week_start AND (w.week_start + 6)
        AND (h.completed_at IS NULL OR h.completed_at::date > h.due_date)
    )
  FROM families f
  CROSS JOIN LATERAL (
    SELECT generate_series(
      date_trunc('week', COALESCE(f.move_in_date, f.created_at::date))::date,
      date_trunc('week', current_date)::date - 7,
      interval '7 days'
    )::date AS week_start
  ) w
  WHERE f.active = true
    -- skip entirely if either night wasn't actually held that week
    AND EXISTS (
      SELECT 1 FROM lcp_session_logs sl
      WHERE sl.session_type = 'monday_mentoring' AND date_trunc('week', sl.session_date)::date = w.week_start
    )
    AND EXISTS (
      SELECT 1 FROM lcp_session_logs sl
      WHERE sl.session_type = 'thursday_group' AND date_trunc('week', sl.session_date)::date = w.week_start
    )
  ON CONFLICT (family_id, week_start) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE families f
  SET housing_savings_cents = f.housing_savings_legacy_cents
    + ((SELECT count(*) FROM lcp_perfect_weeks pw WHERE pw.family_id = f.id AND pw.complete) / 4)::int * 10000
  WHERE f.active = true;

  RETURN n;
END $$;
