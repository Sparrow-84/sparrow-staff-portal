-- Automates stat holiday calendar population (wasp nest "Pending decisions" item),
-- unblocked by Andrew's 2026-07-24 answer: no work expected on any of the 6
-- Employee Handbook §6.3 holidays, weekend-landing holidays shift to the nearest
-- weekday the standard federal way (Saturday -> observed Friday, Sunday ->
-- observed Monday), and there is no paid holiday-benefit system yet (staff just
-- adjust their hours that week) — so this only ever writes calendar visibility,
-- nothing payroll-related.
--
-- Mirrors emit_staff_birthday_events() (0091/0100): a SECURITY DEFINER function
-- fired opportunistically from fetchCalendar(), computing this year's + next
-- year's occurrence of each holiday, deduped via the same source_system/source_ref
-- unique index. Dedup key is date-based ('stat_holiday:<resolved-date>'), matching
-- the exact format 0099 used to seed 2026 by hand — so running this the first
-- time is a no-op for 2026 (already seeded) and only adds 2027 (and beyond, as
-- years roll forward). No annual manual migration ever again.
--
-- 3 of the 6 holidays are fixed calendar dates and can land on a weekend: New
-- Year's Day (Jan 1), Independence Day (Jul 4), Christmas Day (Dec 25). The
-- other 3 are already defined as "nth weekday of month" and can never land on a
-- weekend: Memorial Day (last Monday of May), Labor Day (first Monday of
-- September), Thanksgiving (4th Thursday of November).

CREATE OR REPLACE FUNCTION stat_holiday_shift_weekend(d date) RETURNS date
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE extract(dow FROM d)
    WHEN 6 THEN d - 1   -- Saturday -> observed Friday
    WHEN 0 THEN d + 1   -- Sunday -> observed Monday
    ELSE d
  END;
$$;

CREATE OR REPLACE FUNCTION emit_stat_holiday_events() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_year   int;
  label         uuid;
  actual_date   date;
  observed_date date;
  n             int := 0;
BEGIN
  SELECT id INTO label FROM calendar_labels WHERE name = 'Stat Holiday' LIMIT 1;

  FOR target_year IN extract(year FROM current_date)::int .. extract(year FROM current_date)::int + 1 LOOP

    -- New Year's Day
    actual_date := make_date(target_year, 1, 1);
    observed_date := stat_holiday_shift_weekend(actual_date);
    INSERT INTO calendar_events (kind, title, starts_at, all_day, department, label_id, source_system, source_ref)
    VALUES ('holiday', 'New Year''s Day' || CASE WHEN observed_date <> actual_date THEN ' (observed)' ELSE '' END,
            observed_date::timestamptz, true, null, label, 'stat_holiday', 'stat_holiday:' || observed_date::text)
    ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
    n := n + 1;

    -- Memorial Day: last Monday of May
    SELECT max(d) INTO observed_date FROM generate_series(make_date(target_year, 5, 1), make_date(target_year, 5, 31), '1 day') d
      WHERE extract(dow FROM d) = 1;
    INSERT INTO calendar_events (kind, title, starts_at, all_day, department, label_id, source_system, source_ref)
    VALUES ('holiday', 'Memorial Day', observed_date::timestamptz, true, null, label, 'stat_holiday', 'stat_holiday:' || observed_date::text)
    ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
    n := n + 1;

    -- Independence Day
    actual_date := make_date(target_year, 7, 4);
    observed_date := stat_holiday_shift_weekend(actual_date);
    INSERT INTO calendar_events (kind, title, starts_at, all_day, department, label_id, source_system, source_ref)
    VALUES ('holiday', 'Independence Day' || CASE WHEN observed_date <> actual_date THEN ' (observed)' ELSE '' END,
            observed_date::timestamptz, true, null, label, 'stat_holiday', 'stat_holiday:' || observed_date::text)
    ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
    n := n + 1;

    -- Labor Day: first Monday of September
    SELECT min(d) INTO observed_date FROM generate_series(make_date(target_year, 9, 1), make_date(target_year, 9, 30), '1 day') d
      WHERE extract(dow FROM d) = 1;
    INSERT INTO calendar_events (kind, title, starts_at, all_day, department, label_id, source_system, source_ref)
    VALUES ('holiday', 'Labor Day', observed_date::timestamptz, true, null, label, 'stat_holiday', 'stat_holiday:' || observed_date::text)
    ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
    n := n + 1;

    -- Thanksgiving: 4th Thursday of November
    SELECT d INTO observed_date FROM generate_series(make_date(target_year, 11, 1), make_date(target_year, 11, 30), '1 day') d
      WHERE extract(dow FROM d) = 4
      ORDER BY d OFFSET 3 LIMIT 1;
    INSERT INTO calendar_events (kind, title, starts_at, all_day, department, label_id, source_system, source_ref)
    VALUES ('holiday', 'Thanksgiving', observed_date::timestamptz, true, null, label, 'stat_holiday', 'stat_holiday:' || observed_date::text)
    ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
    n := n + 1;

    -- Christmas Day
    actual_date := make_date(target_year, 12, 25);
    observed_date := stat_holiday_shift_weekend(actual_date);
    INSERT INTO calendar_events (kind, title, starts_at, all_day, department, label_id, source_system, source_ref)
    VALUES ('holiday', 'Christmas Day' || CASE WHEN observed_date <> actual_date THEN ' (observed)' ELSE '' END,
            observed_date::timestamptz, true, null, label, 'stat_holiday', 'stat_holiday:' || observed_date::text)
    ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
    n := n + 1;

  END LOOP;
  RETURN n;
END $$;
