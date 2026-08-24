-- 0170_google_calendar_sync.sql
-- Design Session E, part 2: two independent, one-way link-based feeds -- not a real
-- two-way sync, no Google OAuth/Calendar API needed for either direction.
--
--   export: Sparrow generates a per-person secret ICS feed URL (google_calendar_export_token)
--   that a person subscribes to in Google Calendar ("Add calendar > From URL"). Regenerating
--   the token invalidates the old link, in case it ever leaks.
--
--   import: a person pastes their OWN Google Calendar's secret ICS address
--   (google_calendar_import_url) into Settings; Sparrow periodically fetches it and
--   materializes matching events as ordinary personal calendar_events rows, tagged via the
--   existing source_system/source_ref convention (same mechanism as staff birthdays/stat
--   holidays) so they show up everywhere personal events already do -- Calendar tab, My
--   Week, Upcoming Meetings -- with no separate widget wiring needed.
--
-- The existing calendar_events_source_uniq partial unique index (source_system, source_ref
-- where source_system is not null, from 0091) already covers the dedup/upsert this needs --
-- source_system = 'google_import', source_ref = '<user_id>:<google event uid>' (namespaced
-- per user so two people's Google calendars can't collide on the same raw UID).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS google_calendar_export_token uuid,
  ADD COLUMN IF NOT EXISTS google_calendar_import_url text,
  ADD COLUMN IF NOT EXISTS google_calendar_last_synced_at timestamptz;

DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_google_export_token_uniq UNIQUE (google_calendar_export_token);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
