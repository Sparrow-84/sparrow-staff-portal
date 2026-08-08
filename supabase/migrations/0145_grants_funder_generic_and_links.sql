-- 0144_grants_funder_generic_and_links.sql
-- Three fixes surfaced testing 0137-0139:
--
-- 1. The OHCS contact/certification fields were hardcoded to one funder. Most grants
--    aren't OHCS, so this renames them to generic funder fields. Column rename only —
--    no data is touched, existing values move with the column.
-- 2. Active Grants never had a Links feature (only Prospects did, from 0137), so a
--    prospect's links looked like they vanished when awarded into a real grant. Adds
--    grant_links (same shape as grant_prospect_links) and copies them over on award.
-- 3. emit_grant_calendar_events() created the calendar event but never marked the
--    grant/prospect's owner as attending it — dept-calendar events default to NOT
--    attending until an explicit row exists (0057), so the reminder never showed up
--    on the owner's own My Week widget even though it was on the shared Ops calendar.

-- ─── 1. Generic funder-contact fields ────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE grants RENAME COLUMN ohcs_contact_name TO funder_contact_name;
EXCEPTION WHEN undefined_column THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE grants RENAME COLUMN ohcs_contact_email TO funder_contact_email;
EXCEPTION WHEN undefined_column THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE grants RENAME COLUMN ohcs_contact_phone TO funder_contact_phone;
EXCEPTION WHEN undefined_column THEN null;
END $$;

-- ─── 2. Links on Active Grants (mirrors grant_prospect_links from 0137) ──────────
CREATE TABLE IF NOT EXISTS grant_links (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id   uuid        NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  label      text        NOT NULL,
  url        text        NOT NULL,
  created_by uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_links_grant_idx ON grant_links(grant_id);

ALTER TABLE grant_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY grant_links_all ON grant_links FOR ALL TO authenticated
    USING (has_ops_access()) WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Redefine mark_prospect_awarded() to also carry the prospect's links onto the new
-- grant — everything else identical to 0139's version.
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

  INSERT INTO grant_links (grant_id, label, url, created_by)
  SELECT v_grant_id, label, url, created_by FROM grant_prospect_links WHERE prospect_id = p_prospect_id;

  UPDATE grant_prospects
  SET status = 'awarded', converted_grant_id = v_grant_id
  WHERE id = p_prospect_id;

  RETURN v_grant_id;
END;
$$;

-- ─── 3. Auto-attend the owner on grant calendar events ───────────────────────────
-- Also drops the OHCS-specific wording from the auto-generated event title now that
-- these fields apply to any funder.
CREATE OR REPLACE FUNCTION emit_grant_calendar_events() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    WHERE status IN ('not_researched', 'researching', 'decided_pursue', 'applied')
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
END $$;
