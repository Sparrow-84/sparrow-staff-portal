-- Sparrow — Stories & Media: field cleanup after Susanna's first real use
-- - Adds subject_alias (the public/story name used in place of a participant's
--   real name — kept alongside the real name so 5 years from now we still know
--   who a published story was actually about).
-- - Renames written_by -> logged_by: it was never meant to record who wrote the
--   prose, just who gathered/entered the story, for traceability.
-- - Drops status entirely: "used_in" already answers whether/where a story's
--   been used, so a separate status flag added nothing — Susanna confirmed she
--   doesn't need it once that overlap was pointed out.
-- - Drops layer2_photo_form: a "yes/no" here only ever meant "a form exists,"
--   not what it actually authorized, which read as a false green light. Real
--   Layer 2 tracking already lives properly in story_layer2_consents (Media
--   Release tab) with an actual signed/not-signed value — no need for a
--   shadow copy of it on the story record itself.
-- Depends on: 0081_stories_room.sql, 0093_stories_admin_access.sql
-- Safe to re-run: ADD COLUMN/DROP COLUMN use IF [NOT] EXISTS; rename guarded.

ALTER TABLE stories ADD COLUMN IF NOT EXISTS subject_alias text;

DO $$ BEGIN
  ALTER TABLE stories RENAME COLUMN written_by TO logged_by;
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE stories RENAME CONSTRAINT stories_written_by_fkey TO stories_logged_by_fkey;
EXCEPTION WHEN undefined_object THEN null;
END $$;

ALTER TABLE stories DROP COLUMN IF EXISTS status;
ALTER TABLE stories DROP COLUMN IF EXISTS layer2_photo_form;
