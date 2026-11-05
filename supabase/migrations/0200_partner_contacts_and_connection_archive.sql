-- 1. Multiple contacts per Directory organization, each with a role, one starred primary.
-- 2. Meaningful Connections can be archived, and remember which Directory record they
--    moved to.
-- Agreed with Susanna 2026-11-04. Depends on 0199 (runs after it; no hard dependency on
-- its objects, but ships in the same batch). Safe to re-run.

-- ─── 1. partner_contacts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_contacts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  role        text,
  phone       text,
  email       text,
  notes       text,
  is_primary  boolean     NOT NULL DEFAULT false,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_contacts_partner_idx ON partner_contacts(partner_id);
-- At most one starred primary per organization.
CREATE UNIQUE INDEX IF NOT EXISTS partner_contacts_one_primary
  ON partner_contacts(partner_id) WHERE is_primary;

DO $$ BEGIN
  CREATE TRIGGER partner_contacts_set_updated_at
    BEFORE UPDATE ON partner_contacts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Same reach as the organization record itself (partners_select / partners_write, 0008).
ALTER TABLE partner_contacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY partner_contacts_all ON partner_contacts
    FOR ALL TO authenticated
    USING (partnerships_has_access()
           OR EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()))
    WITH CHECK (partnerships_has_access()
           OR EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- The starred primary is mirrored onto partners.contact_name / partners.role, so the
-- Directory's Contact Person column, search, and everything else that reads those two
-- fields keeps working unchanged. Kept in sync both ways; pg_trigger_depth() stops the
-- two triggers from bouncing off each other.
CREATE OR REPLACE FUNCTION partner_contacts_sync_to_partner() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner uuid := COALESCE(NEW.partner_id, OLD.partner_id);
  v_name text;
  v_role text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  SELECT name, role INTO v_name, v_role FROM partner_contacts WHERE partner_id = v_partner AND is_primary;
  UPDATE partners SET contact_name = v_name, role = v_role
  WHERE id = v_partner
    AND (contact_name IS DISTINCT FROM v_name OR role IS DISTINCT FROM v_role);
  RETURN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER partner_contacts_sync_to_partner_trg
    AFTER INSERT OR UPDATE OR DELETE ON partner_contacts
    FOR EACH ROW EXECUTE FUNCTION partner_contacts_sync_to_partner();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Editing Contact Person / Role straight on the Directory record (the table cell, the Add
-- form) updates the starred contact, or adds one if there isn't one yet. Clearing the name
-- just un-stars the primary; the person stays on the contacts list.
CREATE OR REPLACE FUNCTION partners_sync_primary_contact() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.contact_name IS NOT DISTINCT FROM OLD.contact_name
     AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NULL;
  END IF;

  IF nullif(trim(NEW.contact_name), '') IS NULL THEN
    UPDATE partner_contacts SET is_primary = false WHERE partner_id = NEW.id AND is_primary;
  ELSIF EXISTS (SELECT 1 FROM partner_contacts WHERE partner_id = NEW.id AND is_primary) THEN
    UPDATE partner_contacts SET name = trim(NEW.contact_name), role = NEW.role
    WHERE partner_id = NEW.id AND is_primary;
  ELSE
    INSERT INTO partner_contacts (partner_id, name, role, is_primary, created_by)
    VALUES (NEW.id, trim(NEW.contact_name), NEW.role, true, auth.uid());
  END IF;
  RETURN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER partners_sync_primary_contact_trg
    AFTER INSERT OR UPDATE OF contact_name, role ON partners
    FOR EACH ROW EXECUTE FUNCTION partners_sync_primary_contact();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Backfill: every record's existing contact becomes its starred primary. Phone/email stay
-- on the record (they've been the organization's main line); add a contact's own number on
-- the contact.
INSERT INTO partner_contacts (partner_id, name, role, is_primary, created_by)
SELECT p.id, trim(p.contact_name), p.role, true, NULL
FROM partners p
WHERE nullif(trim(p.contact_name), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM partner_contacts c WHERE c.partner_id = p.id);

-- ─── 2. Meaningful Connections: archive + "moved to" ─────────────────
ALTER TABLE partnership_connections ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE partnership_connections ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE partnership_connections ADD COLUMN IF NOT EXISTS converted_to_partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;

-- Archiving (or marking the follow-up done) closes any open follow-up task. Before this,
-- nothing closed those tasks, so a finished follow-up could linger in someone's task list.
CREATE OR REPLACE FUNCTION resolve_connection_followup_task() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.followup_done AND NOT OLD.followup_done)
     OR (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL) THEN
    PERFORM resolve_system_task('crm', 'connection_followup:' || NEW.id);
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER partnership_connections_resolve_followup
    AFTER UPDATE OF followup_done, archived_at ON partnership_connections
    FOR EACH ROW EXECUTE FUNCTION resolve_connection_followup_task();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Same as 0080's version, plus: archived connections never generate a follow-up task.
CREATE OR REPLACE FUNCTION emit_overdue_connection_followups() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT c.id, c.name, c.followup_due, c.owner_id, e.event_name
    FROM   partnership_connections c
    LEFT JOIN partnership_events e ON e.id = c.event_id
    WHERE  c.followup_done = false
      AND  c.archived_at IS NULL
      AND  c.owner_id IS NOT NULL
      AND  (c.followup_due - COALESCE(c.lead_time_days, 0)) <= current_date
  LOOP
    PERFORM emit_system_task(
      'crm',
      'connection_followup:' || r.id,
      r.owner_id,
      'Follow up with ' || r.name || CASE WHEN r.event_name IS NOT NULL THEN ' from ' || r.event_name ELSE '' END,
      'partnerships'::department,
      'p2'::priority,
      r.followup_due
    );
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;

-- ─── 3. Go-to contact per Resident Services program/service ─────────
-- Which of the organization's contacts to call about this specific program (e.g. the Voc
-- Rehab counselor at DHS, not the DHS partnership contact). Internal only: never returned
-- by get_public_resources(). Removing the contact just clears it.
ALTER TABLE resident_services ADD COLUMN IF NOT EXISTS go_to_contact_id uuid
  REFERENCES partner_contacts(id) ON DELETE SET NULL;
