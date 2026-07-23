-- Seeds the 2026 stat holidays onto the All Staff calendar, per the Employee
-- Handbook section 6.3 (Holidays): New Year's Day, Memorial Day, Independence
-- Day, Labor Day, Thanksgiving, Christmas Day. Independence Day falls on a
-- Saturday in 2026, so it's placed on the standard observed date (Fri, Jul 3)
-- instead of the calendar date.
--
-- All-day, department = null (All Staff), labeled with the existing preset
-- "Stat Holiday" calendar label. Deduped via the source_system/source_ref
-- unique index added in 0091 (same convention as staff birthdays), so
-- re-running this migration is a no-op.

INSERT INTO calendar_events (kind, title, starts_at, all_day, department, label_id, source_system, source_ref)
SELECT v.kind, v.title, v.starts_at, true, null,
       (SELECT id FROM calendar_labels WHERE name = 'Stat Holiday' LIMIT 1),
       'stat_holiday', v.source_ref
FROM (VALUES
  ('holiday'::calendar_kind, 'New Year''s Day',              '2026-01-01T00:00:00+00:00'::timestamptz, 'stat_holiday:2026-01-01'),
  ('holiday'::calendar_kind, 'Memorial Day',                 '2026-05-25T00:00:00+00:00'::timestamptz, 'stat_holiday:2026-05-25'),
  ('holiday'::calendar_kind, 'Independence Day (observed)',  '2026-07-03T00:00:00+00:00'::timestamptz, 'stat_holiday:2026-07-03'),
  ('holiday'::calendar_kind, 'Labor Day',                    '2026-09-07T00:00:00+00:00'::timestamptz, 'stat_holiday:2026-09-07'),
  ('holiday'::calendar_kind, 'Thanksgiving',                 '2026-11-26T00:00:00+00:00'::timestamptz, 'stat_holiday:2026-11-26'),
  ('holiday'::calendar_kind, 'Christmas Day',                '2026-12-25T00:00:00+00:00'::timestamptz, 'stat_holiday:2026-12-25')
) AS v(kind, title, starts_at, source_ref)
ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
