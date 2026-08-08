-- 0139_grant_owner_calendar_reminders.sql
-- Roadmap items 1-3 from the Grants Directory design conversation. Depends on 0138
-- (adds the 'grant' calendar_kind value this migration's functions insert with).
--   1. Owner field on Active Grants and Prospects
--   2. Certification / application dates auto-pushed to the Ops calendar
--   3. A real reminder (task, not just a calendar dot) N days before something's due
--
-- ─── 0. Cron-safe access check — same fix 0080 applied to partnerships_has_access(),
-- needed here because the new reminder function below runs on a daily pg_cron job,
-- which has no request/JWT context (auth.uid() is null there). Real end-user calls
-- always run as 'anon'/'authenticated' via PostgREST, so this only widens trust for
-- the scheduler/service context, never for the public API. ─────────────────────────
CREATE OR REPLACE FUNCTION has_ops_access() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    current_user NOT IN ('anon', 'authenticated')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND ops_access);
$$;

-- ─── 1. Owner field ──────────────────────────────────────────────────────────────
-- Left nullable on both tables (unlike lead_time_days below) — there's no safe
-- universal default owner to backfill onto the existing GHAP grant without guessing;
-- emit_grant_reminder_tasks() below simply skips anything with no owner set, exactly
-- like the partnerships reminder engine already does for owner-less partners.
ALTER TABLE grants ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE grant_prospects ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- ─── 2. Lead time — safe to backfill with a harmless default, unlike owner ────────
ALTER TABLE grants ADD COLUMN IF NOT EXISTS lead_time_days int;
UPDATE grants SET lead_time_days = 30 WHERE lead_time_days IS NULL;
ALTER TABLE grants ALTER COLUMN lead_time_days SET NOT NULL;
ALTER TABLE grants ALTER COLUMN lead_time_days SET DEFAULT 30;

ALTER TABLE grant_prospects ADD COLUMN IF NOT EXISTS lead_time_days int;
UPDATE grant_prospects SET lead_time_days = 30 WHERE lead_time_days IS NULL;
ALTER TABLE grant_prospects ALTER COLUMN lead_time_days SET NOT NULL;
ALTER TABLE grant_prospects ALTER COLUMN lead_time_days SET DEFAULT 30;

-- ─── 4. Auto-push certification / application dates to the Ops calendar ──────────
-- Mirrors emit_staff_birthday_events()/emit_stat_holiday_events(): fired opportunistically
-- from fetchCalendar() (client-authenticated context — no cron-access concern here),
-- deduped via the same source_system/source_ref unique index on calendar_events.
CREATE OR REPLACE FUNCTION emit_grant_calendar_events() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN SELECT id, funder_name, certification_due_date FROM grants
    WHERE status = 'active' AND certification_due_date IS NOT NULL
  LOOP
    INSERT INTO calendar_events (kind, title, starts_at, all_day, department, source_system, source_ref)
    VALUES ('grant', 'OHCS certification due — ' || r.funder_name, r.certification_due_date::timestamptz, true, 'ops',
            'grant_certification', 'grant_certification:' || r.id || ':' || r.certification_due_date::text)
    ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
    n := n + 1;
  END LOOP;

  FOR r IN SELECT id, name, application_opens, application_deadline FROM grant_prospects
    WHERE status IN ('not_researched', 'researching', 'decided_pursue', 'applied')
  LOOP
    IF r.application_opens IS NOT NULL THEN
      INSERT INTO calendar_events (kind, title, starts_at, all_day, department, source_system, source_ref)
      VALUES ('grant', 'Application opens — ' || r.name, r.application_opens::timestamptz, true, 'ops',
              'grant_prospect_opens', 'grant_prospect_opens:' || r.id || ':' || r.application_opens::text)
      ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
      n := n + 1;
    END IF;
    IF r.application_deadline IS NOT NULL THEN
      INSERT INTO calendar_events (kind, title, starts_at, all_day, department, source_system, source_ref)
      VALUES ('grant', 'Application deadline — ' || r.name, r.application_deadline::timestamptz, true, 'ops',
              'grant_prospect_deadline', 'grant_prospect_deadline:' || r.id || ':' || r.application_deadline::text)
      ON CONFLICT (source_system, source_ref) WHERE source_system IS NOT NULL DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END $$;

-- ─── 5. Real reminder tasks — a daily pg_cron job, not dependent on anyone opening
-- a screen. Uses the existing emit_system_task()/resolve_system_task() helpers (0006)
-- so dedup and Triage Inbox routing work exactly like every other room's tasks. ────
CREATE OR REPLACE FUNCTION emit_grant_reminder_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  IF NOT has_ops_access() THEN
    RETURN 0;
  END IF;

  -- Active grants: remind the owner once we're inside the lead-time window of the
  -- certification due date. source_ref includes the due date itself, so rolling it
  -- forward a year via "Mark certified today" naturally starts a fresh reminder cycle.
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

  -- Prospects still in motion: remind the owner once inside the lead-time window of
  -- the application deadline. Resolved automatically (see trigger below) once the
  -- prospect moves off an active-pursuing status.
  FOR r IN
    SELECT id, name, owner_id, application_deadline
    FROM grant_prospects
    WHERE status IN ('not_researched', 'researching', 'decided_pursue', 'applied')
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
END $$;

-- Resolve a prospect's reminder task the moment it stops being "in motion" — decided
-- no, applied (deadline already met by submitting), or awarded all count as handled.
CREATE OR REPLACE FUNCTION resolve_prospect_reminder() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('not_researched', 'researching', 'decided_pursue')
     AND OLD.application_deadline IS NOT NULL THEN
    PERFORM resolve_system_task('grant_prospect_deadline', 'grant_prospect_deadline:' || NEW.id || ':' || OLD.application_deadline::text);
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER grant_prospect_resolve_reminder
    AFTER UPDATE OF status ON grant_prospects
    FOR EACH ROW EXECUTE FUNCTION resolve_prospect_reminder();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Redefines 0137's mark_prospect_awarded() now that owner_id exists on both tables —
-- carries the prospect's own owner over onto the new grant, so ownership doesn't
-- silently reset to nobody the moment something gets awarded.
CREATE OR REPLACE FUNCTION mark_prospect_awarded(p_prospect_id uuid, p_created_by uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prospect grant_prospects;
  v_grant_id uuid;
  v_notes text;
BEGIN
  IF NOT has_ops_access() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_prospect FROM grant_prospects WHERE id = p_prospect_id;
  IF v_prospect IS NULL THEN
    RAISE EXCEPTION 'Prospect not found';
  END IF;

  v_notes := 'Converted from a Grants prospect on ' || to_char(now(), 'YYYY-MM-DD') || '.';
  IF v_prospect.findings IS NOT NULL THEN
    v_notes := v_notes || E'\n\nFindings: ' || v_prospect.findings;
  END IF;
  IF v_prospect.decision_reasoning IS NOT NULL THEN
    v_notes := v_notes || E'\n\nWhy pursued: ' || v_prospect.decision_reasoning;
  END IF;

  INSERT INTO grants (funder_name, amount, notes, created_by, status, owner_id)
  VALUES (v_prospect.name, v_prospect.est_amount, v_notes, p_created_by, 'active', v_prospect.owner_id)
  RETURNING id INTO v_grant_id;

  UPDATE grant_prospects
  SET status = 'awarded', converted_grant_id = v_grant_id
  WHERE id = p_prospect_id;

  RETURN v_grant_id;
END;
$$;

-- Resolve a grant's certification reminder the moment it's actually certified.
CREATE OR REPLACE FUNCTION resolve_grant_certification_reminder() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.last_certified_on IS DISTINCT FROM OLD.last_certified_on AND OLD.certification_due_date IS NOT NULL THEN
    PERFORM resolve_system_task('grant_certification', 'grant_certification:' || NEW.id || ':' || OLD.certification_due_date::text);
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER grant_resolve_certification_reminder
    AFTER UPDATE OF last_certified_on ON grants
    FOR EACH ROW EXECUTE FUNCTION resolve_grant_certification_reminder();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Daily at 13:00 UTC (~6am Pacific), same slot as the partnerships reminder job.
DO $$ BEGIN
  PERFORM cron.schedule(
    'grant-reminders-daily',
    '0 13 * * *',
    'SELECT emit_grant_reminder_tasks();'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
