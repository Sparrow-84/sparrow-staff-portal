-- 0171_grant_contacts.sql
-- Multiple named contacts per grant/prospect, independent of status — Susanna wants contact
-- info retained even for a "Not Moving Forward" prospect, since it could get revisited later.
-- Replaces the old single funder_contact_name/email/phone fields on `grants` (one contact,
-- lost if unset — renamed from ohcs_contact_* in 0145) with a proper list, same shape on
-- both grants and grant_prospects so a prospect's contacts survive the move to an Active Grant.

-- ─── Contacts on Active/Past Grants ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grant_contacts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id   uuid        NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  email      text,
  phone      text,
  note       text,                                            -- title / how connected
  created_by uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_contacts_grant_idx ON grant_contacts(grant_id);

ALTER TABLE grant_contacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY grant_contacts_all ON grant_contacts FOR ALL TO authenticated
    USING (has_ops_access()) WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Contacts on Grant Prospects ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grant_prospect_contacts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid        NOT NULL REFERENCES grant_prospects(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  email       text,
  phone       text,
  note        text,
  created_by  uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_prospect_contacts_prospect_idx ON grant_prospect_contacts(prospect_id);

ALTER TABLE grant_prospect_contacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY grant_prospect_contacts_all ON grant_prospect_contacts FOR ALL TO authenticated
    USING (has_ops_access()) WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Migrate the existing single funder contact off `grants` into the new table, then drop it ──
INSERT INTO grant_contacts (grant_id, name, email, phone, note)
SELECT id, funder_contact_name, funder_contact_email, funder_contact_phone, 'Funder contact'
FROM grants
WHERE funder_contact_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM grant_contacts gc WHERE gc.grant_id = grants.id AND gc.name = grants.funder_contact_name
  );

ALTER TABLE grants DROP COLUMN IF EXISTS funder_contact_name;
ALTER TABLE grants DROP COLUMN IF EXISTS funder_contact_email;
ALTER TABLE grants DROP COLUMN IF EXISTS funder_contact_phone;

-- ─── Carry contacts forward when a prospect is awarded and becomes a real Grant ──────
CREATE OR REPLACE FUNCTION copy_prospect_contacts_to_grant() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.converted_grant_id IS NOT NULL AND (OLD.converted_grant_id IS NULL OR OLD.converted_grant_id IS DISTINCT FROM NEW.converted_grant_id) THEN
    INSERT INTO grant_contacts (grant_id, name, email, phone, note, created_by)
    SELECT NEW.converted_grant_id, name, email, phone, note, created_by
    FROM grant_prospect_contacts
    WHERE prospect_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER grant_prospect_contacts_carry_forward
    AFTER UPDATE ON grant_prospects
    FOR EACH ROW EXECUTE FUNCTION copy_prospect_contacts_to_grant();
EXCEPTION WHEN duplicate_object THEN null;
END $$;
