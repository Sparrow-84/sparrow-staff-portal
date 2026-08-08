-- 0143_personal_contacts_partnerships_update.sql
-- Lets Partnerships staff correct/update any field on any staff member's logged contact
-- directly from the All Staff Contacts tab (e.g. a phone number changed, a typo), not just
-- view them read-only. Additive alongside the existing own-row policy from 0141 (Postgres
-- OR's multiple permissive policies for the same command) — a contact's own creator can
-- still always edit their own, this just widens who else also can.

DO $$ BEGIN
  CREATE POLICY personal_contacts_update_partnerships ON personal_contacts
    FOR UPDATE
    USING (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
