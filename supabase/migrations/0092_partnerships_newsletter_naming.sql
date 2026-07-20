-- Sparrow — Partnerships: consistent newsletter naming
-- Susanna noticed the newsletter reminders were inconsistently titled: some
-- partnership_comms rows spell out "Sparrow Monthly", others already use "TSM".
-- Standardize on "TSM" everywhere, and drop the redundant "Newsletter — " prefix
-- these reminders were adding on top of that (the item already reads as a
-- newsletter once it says "TSM").
-- Depends on: 0080_partnerships_reminder_engine.sql (partnership_comms, emit_newsletter_reminder_tasks)
-- Safe to re-run: the title UPDATE only touches rows still spelled out in full,
-- and CREATE OR REPLACE is always safe to re-run.

UPDATE partnership_comms
SET title = regexp_replace(title, '^Sparrow Monthly', 'TSM')
WHERE title LIKE 'Sparrow Monthly%';

CREATE OR REPLACE FUNCTION emit_newsletter_reminder_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; cfg record;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;

  SELECT lead_time_days, owner_id INTO cfg
  FROM partnership_recurring_settings WHERE kind = 'newsletter';
  IF NOT FOUND THEN
    RETURN 0;                                   -- settings row not seeded yet
  END IF;

  FOR r IN
    SELECT id, title, publish_date
    FROM partnership_comms
    WHERE status = 'not_started'
      AND (publish_date - cfg.lead_time_days) <= current_date
  LOOP
    PERFORM emit_system_task(
      'crm', 'comms:' || r.id, cfg.owner_id,
      r.title || ' due ' || to_char(r.publish_date, 'FMMonth FMDD, YYYY'),
      'partnerships'::department, 'p3'::priority, r.publish_date
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
