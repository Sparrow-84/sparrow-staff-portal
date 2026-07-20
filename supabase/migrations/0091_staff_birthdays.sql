-- Staff birthdays auto-populate the all-staff calendar (wasp nest #9).
-- birthday lives on the profile; a SECURITY DEFINER emitter materializes it as a
-- yearly all-staff calendar_events row, following the emit_system_task /
-- emit_collateral_review_task dedup-by-source_ref convention.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday date;

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS source_ref    text;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_source_uniq ON calendar_events(source_system, source_ref)
  WHERE source_system IS NOT NULL;

-- Emits this year's and next year's occurrence for every active staff member with a
-- birthday set, as an all-day, all-staff (department = null) event. Dedup key is
-- 'birthday:<profile_id>:<year>', so re-running (every calendar load) is a no-op once
-- a year's event exists — a past occurrence is left in place as calendar history
-- rather than deleted, same as any other past event.
CREATE OR REPLACE FUNCTION emit_staff_birthday_events() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  staff       record;
  target_year int;
  event_date  date;
  n           int := 0;
BEGIN
  FOR staff IN
    SELECT id, full_name, birthday FROM profiles WHERE active = true AND birthday IS NOT NULL
  LOOP
    FOR target_year IN extract(year FROM current_date)::int .. extract(year FROM current_date)::int + 1 LOOP
      BEGIN
        event_date := make_date(target_year, extract(month FROM staff.birthday)::int, extract(day FROM staff.birthday)::int);
      EXCEPTION WHEN OTHERS THEN
        event_date := make_date(target_year, 2, 28);   -- Feb 29 birthday, non-leap target year
      END;

      INSERT INTO calendar_events (kind, title, starts_at, all_day, department, source_system, source_ref)
      VALUES (
        'birthday', staff.full_name || '''s birthday 🎂', event_date::timestamptz, true, null,
        'staff_birthdays', 'birthday:' || staff.id || ':' || target_year
      )
      ON CONFLICT (source_system, source_ref) DO NOTHING;
      n := n + 1;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;
