-- 0235: New Grants prospect status "Waiting to open" (Susanna, 2026-11-23) — for a grant
-- we've decided to go for but whose application cycle hasn't opened yet.
--
-- Also adds it to the three places that decide which prospects get calendar events and
-- deadline reminder tasks, so a "Waiting to open" grant keeps getting its reminders.
-- The function bodies below are copied from the live database (read 2026-11-23), with only
-- the status lists changed. They compare status::text so this file can run in one go —
-- Postgres won't let a brand-new enum value be used as an enum in the same transaction.
--
-- Safe to run twice. Touches no grant data.

ALTER TYPE grant_prospect_status ADD VALUE IF NOT EXISTS 'waiting_to_open' AFTER 'decided_pursue';

CREATE OR REPLACE FUNCTION public.emit_grant_reminder_tasks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  n int := 0;
BEGIN
  IF NOT has_ops_access() THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id, funder_name, owner_id, certification_due_date
    FROM grants
    WHERE status = 'active' AND owner_id IS NOT NULL AND certification_due_date IS NOT NULL
      AND certification_due_date - lead_time_days <= current_date
  LOOP
    PERFORM emit_system_task(
      'grant_certification', 'grant_certification:' || r.id || ':' || r.certification_due_date::text,
      r.owner_id, 'OHCS certification due ' || to_char(r.certification_due_date, 'Mon DD, YYYY') || ' — ' || r.funder_name,
      'ops', 'p2', r.certification_due_date
    );
    n := n + 1;
  END LOOP;

  FOR r IN
    SELECT id, name, owner_id, application_deadline
    FROM grant_prospects
    WHERE status::text IN ('not_researched', 'researching', 'decided_pursue', 'waiting_to_open', 'applied')
      AND owner_id IS NOT NULL AND application_deadline IS NOT NULL
      AND application_deadline - lead_time_days <= current_date
  LOOP
    PERFORM emit_system_task(
      'grant_prospect_deadline', 'grant_prospect_deadline:' || r.id || ':' || r.application_deadline::text,
      r.owner_id, 'Grant application due ' || to_char(r.application_deadline, 'Mon DD, YYYY') || ' — ' || r.name,
      'ops', 'p2', r.application_deadline
    );
    n := n + 1;
  END LOOP;

  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.emit_grant_calendar_events()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  n int := 0;
  v_event_id uuid;
BEGIN
  FOR r IN SELECT id, funder_name, certification_due_date, owner_id FROM grants
    WHERE status = 'active' AND certification_due_date IS NOT NULL
  LOOP
    INSERT INTO calendar_events (kind, title, starts_at, all_day, department, source_system, source_ref)
    VALUES ('grant', 'Certification due — ' || r.funder_name, r.certification_due_date::timestamptz, true, 'ops',
            'grant_certification', 'grant_certification:' || r.id || ':' || r.certification_due_date::text)
    ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL
    DO UPDATE SET title = excluded.title
    RETURNING id INTO v_event_id;
    n := n + 1;

    IF r.owner_id IS NOT NULL THEN
      INSERT INTO event_attendees (event_id, staff_id, status, added_by)
      VALUES (v_event_id, r.owner_id, 'attending', NULL)
      ON CONFLICT (event_id, staff_id) DO NOTHING;
    END IF;
  END LOOP;

  FOR r IN SELECT id, name, application_opens, application_deadline, owner_id FROM grant_prospects
    WHERE status::text IN ('not_researched', 'researching', 'decided_pursue', 'waiting_to_open', 'applied')
  LOOP
    IF r.application_opens IS NOT NULL THEN
      INSERT INTO calendar_events (kind, title, starts_at, all_day, department, source_system, source_ref)
      VALUES ('grant', 'Application opens — ' || r.name, r.application_opens::timestamptz, true, 'ops',
              'grant_prospect_opens', 'grant_prospect_opens:' || r.id || ':' || r.application_opens::text)
      ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL
      DO UPDATE SET title = excluded.title
      RETURNING id INTO v_event_id;
      n := n + 1;
      IF r.owner_id IS NOT NULL THEN
        INSERT INTO event_attendees (event_id, staff_id, status, added_by)
        VALUES (v_event_id, r.owner_id, 'attending', NULL)
        ON CONFLICT (event_id, staff_id) DO NOTHING;
      END IF;
    END IF;
    IF r.application_deadline IS NOT NULL THEN
      INSERT INTO calendar_events (kind, title, starts_at, all_day, department, source_system, source_ref)
      VALUES ('grant', 'Application deadline — ' || r.name, r.application_deadline::timestamptz, true, 'ops',
              'grant_prospect_deadline', 'grant_prospect_deadline:' || r.id || ':' || r.application_deadline::text)
      ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL
      DO UPDATE SET title = excluded.title
      RETURNING id INTO v_event_id;
      n := n + 1;
      IF r.owner_id IS NOT NULL THEN
        INSERT INTO event_attendees (event_id, staff_id, status, added_by)
        VALUES (v_event_id, r.owner_id, 'attending', NULL)
        ON CONFLICT (event_id, staff_id) DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  RETURN n;
END $function$;

-- A deadline reminder only closes out once the prospect leaves an "in motion" status —
-- moving to Waiting to open must NOT close it.
CREATE OR REPLACE FUNCTION public.resolve_prospect_reminder() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::text NOT IN ('not_researched', 'researching', 'decided_pursue', 'waiting_to_open')
     AND OLD.application_deadline IS NOT NULL THEN
    PERFORM resolve_system_task('grant_prospect_deadline', 'grant_prospect_deadline:' || NEW.id || ':' || OLD.application_deadline::text);
  END IF;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
