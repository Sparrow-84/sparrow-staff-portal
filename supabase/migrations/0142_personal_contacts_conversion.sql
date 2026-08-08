-- 0142_personal_contacts_conversion.sql
-- Lets Partnerships staff "transfer" a staff member's personal contact (0141) into a real
-- Directory partner record once it becomes a real relationship. Tracked via
-- converted_to_partner_id rather than deleting/hiding the row, so the contacts list stays a
-- permanent record of who originally surfaced each partner.

ALTER TABLE personal_contacts
  ADD COLUMN IF NOT EXISTS converted_to_partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;

-- A dedicated SECURITY DEFINER function rather than widening the personal_contacts UPDATE RLS
-- policy — partnerships staff should be able to mark a conversion without gaining general
-- write access to edit the contents of someone else's private contact entry.
CREATE OR REPLACE FUNCTION mark_personal_contact_converted(p_contact_id uuid, p_partner_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT partnerships_has_access() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE personal_contacts SET converted_to_partner_id = p_partner_id WHERE id = p_contact_id;
END $$;
