-- Fixes emit_staff_birthday_events() (from 0091): its ON CONFLICT (source_system,
-- source_ref) clause didn't repeat the partial index's predicate
-- (WHERE source_system IS NOT NULL), which Postgres requires to match an
-- INSERT's ON CONFLICT target to a partial unique index. Every call has been
-- throwing "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification" since 0091 was deployed — silently, since the
-- client calls this fire-and-forget on every calendar load. No staff
-- birthday has ever actually been written to the calendar.

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
      ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
      n := n + 1;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;
