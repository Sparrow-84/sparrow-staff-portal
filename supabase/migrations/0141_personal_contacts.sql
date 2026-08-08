-- 0141_personal_contacts.sql
-- "My Contacts" — a lightweight, mostly one-time-fill-out personal list any staff
-- member (any department) can use to log a personal/professional contact Sparrow
-- should retain and steward as part of its network. This is a distinct concept from
-- partnership_connections (partnerships-department-only, tied to specific events) —
-- own rows are fully personal to log/edit (same model as ideas/user_settings), but
-- Partnerships staff/admin can see (read-only) every contact so they can pull from the
-- pool later. Depends on 0140 (adds the 'new_contact' notification_type value this
-- migration's trigger inserts with).

CREATE TABLE IF NOT EXISTS personal_contacts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  organization text        NOT NULL DEFAULT '',
  relationship text        NOT NULL DEFAULT '',
  phone        text,
  email        text,
  notes        text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personal_contacts_created_by_idx ON personal_contacts(created_by);

ALTER TABLE personal_contacts ENABLE ROW LEVEL SECURITY;

-- Own rows: full CRUD. Partnerships staff/admin: read-only across everyone's contacts
-- (same partnerships_has_access() OR used by partners_select etc. in 0008).
DO $$ BEGIN
  CREATE POLICY personal_contacts_select ON personal_contacts
    FOR SELECT
    USING (created_by = auth.uid() OR partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY personal_contacts_insert ON personal_contacts
    FOR INSERT
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY personal_contacts_update ON personal_contacts
    FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY personal_contacts_delete ON personal_contacts
    FOR DELETE
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER personal_contacts_updated_at BEFORE UPDATE ON personal_contacts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- FYI-only notification (no task implied) to every partnerships-access user when a new
-- contact is logged, so Partnerships knows the pool grew without anyone getting assigned
-- work. Mirrors notify_event_attendees() (0057): one notifications row per recipient,
-- SECURITY DEFINER so it can see/insert across users. Recipient set mirrors
-- partnerships_has_access() (0008) applied per-row instead of to auth.uid().
CREATE OR REPLACE FUNCTION notify_new_personal_contact() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM profiles
    WHERE id <> NEW.created_by
      AND (role = 'admin' OR department = 'partnerships' OR partnerships_access)
  LOOP
    INSERT INTO notifications (user_id, actor_id, type, entity, entity_id, body)
    VALUES (r.id, NEW.created_by, 'new_contact', 'personal_contact', NEW.id, NEW.name);
  END LOOP;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER personal_contact_notify
    AFTER INSERT ON personal_contacts
    FOR EACH ROW EXECUTE FUNCTION notify_new_personal_contact();
EXCEPTION WHEN duplicate_object THEN null;
END $$;
