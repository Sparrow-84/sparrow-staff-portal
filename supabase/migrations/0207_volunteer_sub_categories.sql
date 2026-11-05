-- Volunteer sub-categories: Prayer, LCP, General -- pick as many as apply. Agreed with
-- Susanna 2026-11-05.
--
-- A record's sub_category describes what the record IS (individual / business / church /
-- nonprofit) and there's only one. Volunteer needs its own list, because one person can be
-- several kinds of volunteer (David: General + LCP + Prayer) and Volunteer is often a
-- record's SECOND category (Nessa: Donor + Volunteer/Prayer). The Directory shows each
-- category stacked with its sub-categories on the same line.
--
-- Also fixes the Prayer roster: since 0193 it looked for the retired 'prayer' category, so
-- every prayer volunteer dropped to "No longer active". The app now reads the Prayer
-- volunteer sub-category instead (prayer.ts).
--
-- Idempotent.

ALTER TABLE partners ADD COLUMN IF NOT EXISTS volunteer_sub_categories text[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE partners ADD CONSTRAINT partners_volunteer_sub_categories_chk
    CHECK (volunteer_sub_categories <@ ARRAY['prayer', 'lcp', 'general']::text[]);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Everyone who was Volunteer → Prayer keeps Prayer. Their own sub_category becomes
-- 'individual': a volunteer is always a person, and the kind of volunteering now lives in
-- the list above.
UPDATE partners
SET volunteer_sub_categories = ARRAY['prayer']
WHERE type = 'volunteer' AND sub_category = 'prayer' AND volunteer_sub_categories = '{}';

UPDATE partners SET sub_category = 'individual' WHERE type = 'volunteer' AND sub_category = 'prayer';

-- The two Donors also tagged Volunteer (Anya Wenger, Nessa Pfitzer) were prayer volunteers
-- before 0195 retyped their secondary 'prayer' to 'volunteer', and both are on the prayer
-- roster with attendance.
UPDATE partners
SET volunteer_sub_categories = ARRAY['prayer']
WHERE type <> 'volunteer' AND 'volunteer' = ANY(secondary_types) AND volunteer_sub_categories = '{}';

-- Corrections from Susanna 2026-11-05: Karen is an LCP volunteer (not prayer); David is
-- General + LCP + Prayer. Only applied while they still have the migrated default.
UPDATE partners SET volunteer_sub_categories = ARRAY['lcp']
WHERE name = 'Karen Cornwell' AND volunteer_sub_categories = ARRAY['prayer'];

UPDATE partners SET volunteer_sub_categories = ARRAY['general', 'lcp', 'prayer']
WHERE name = 'David Livingston' AND volunteer_sub_categories = ARRAY['prayer'];

-- A record that stops being a Volunteer (main or second category) loses its volunteer
-- sub-categories, so it can't linger on the Prayer roster.
CREATE OR REPLACE FUNCTION partners_clear_volunteer_sub_categories() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.type <> 'volunteer' AND NOT ('volunteer' = ANY(COALESCE(NEW.secondary_types, '{}'))) THEN
    NEW.volunteer_sub_categories := '{}';
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER partners_clear_volunteer_sub_categories_trg
    BEFORE INSERT OR UPDATE OF type, secondary_types, volunteer_sub_categories ON partners
    FOR EACH ROW EXECUTE FUNCTION partners_clear_volunteer_sub_categories();
EXCEPTION WHEN duplicate_object THEN null;
END $$;
