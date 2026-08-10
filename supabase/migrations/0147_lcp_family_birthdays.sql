-- Migration 0147: LCP participant (mother + children) birthdays.
--
-- Shelly wants a place to record birthdays for program participants so staff
-- can celebrate them appropriately. Follows the same emit-on-calendar-load
-- pattern as staff birthdays (0091, fixed in 0100) and stat holidays (0102):
-- a SECURITY DEFINER function upserts this year's + next year's occurrence,
-- deduped by source_ref, called fire-and-forget on every calendar load.
--
-- Difference from staff birthdays: per Susanna, these only cover *active*
-- families -- once a family moves to the "Past" tab (families.active =
-- false), their birthdays should come off Team Cal immediately, not just
-- stop renewing next year. So this function also prunes any already-emitted
-- rows belonging to now-inactive families' adults/children on every run.
--
-- All LCP birthdays render in the existing 'birthday' calendar kind (added
-- in 0090_calendar_kind_birthday.sql) -- same pink as staff birthdays, per
-- Susanna's call to keep one color for all birthdays -- scoped to
-- department = 'lcp' (same value used by the session sync in 0114) so they
-- only show under the LCP calendar layer.

ALTER TABLE lcp_household_adults ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE lcp_household_children ADD COLUMN IF NOT EXISTS date_of_birth date;

CREATE OR REPLACE FUNCTION emit_lcp_family_birthday_events() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  person      record;
  target_year int;
  event_date  date;
  n           int := 0;
BEGIN
  FOR person IN
    SELECT a.id, a.full_name, a.date_of_birth, 'adult' AS entity_kind
    FROM lcp_household_adults a
    JOIN families f ON f.id = a.family_id
    WHERE f.active = true AND a.date_of_birth IS NOT NULL
    UNION ALL
    SELECT c.id, c.full_name, c.date_of_birth, 'child' AS entity_kind
    FROM lcp_household_children c
    JOIN families f ON f.id = c.family_id
    WHERE f.active = true AND c.date_of_birth IS NOT NULL
  LOOP
    FOR target_year IN extract(year FROM current_date)::int .. extract(year FROM current_date)::int + 1 LOOP
      BEGIN
        event_date := make_date(target_year, extract(month FROM person.date_of_birth)::int, extract(day FROM person.date_of_birth)::int);
      EXCEPTION WHEN OTHERS THEN
        event_date := make_date(target_year, 2, 28);   -- Feb 29 birthday, non-leap target year
      END;

      INSERT INTO calendar_events (kind, title, starts_at, all_day, department, source_system, source_ref)
      VALUES (
        'birthday', person.full_name || '''s birthday 🎂', event_date::timestamptz, true, 'lcp',
        'lcp_family_birthdays', person.entity_kind || ':' || person.id || ':' || target_year
      )
      ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
      n := n + 1;
    END LOOP;
  END LOOP;

  DELETE FROM calendar_events ce
  WHERE ce.source_system = 'lcp_family_birthdays'
    AND (
      (split_part(ce.source_ref, ':', 1) = 'adult' AND split_part(ce.source_ref, ':', 2)::uuid IN (
        SELECT a.id FROM lcp_household_adults a JOIN families f ON f.id = a.family_id WHERE f.active = false
      ))
      OR
      (split_part(ce.source_ref, ':', 1) = 'child' AND split_part(ce.source_ref, ':', 2)::uuid IN (
        SELECT c.id FROM lcp_household_children c JOIN families f ON f.id = c.family_id WHERE f.active = false
      ))
    );

  RETURN n;
END $$;
