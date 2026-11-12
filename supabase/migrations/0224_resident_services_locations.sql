-- 0224: Locations, one list of addresses per organization, and Resident Services cleanup.
-- Run AFTER 0223. Safe to run more than once. Decided with Susanna 2026-11-12.
--
-- 1. organization_addresses: every address an organization has, each with a label
--    ("Corvallis Office", "Food pantry"). Shared by Partnerships (Directory record) and
--    Resident Services. A PRIVATE location (a shelter) stores the city only -- the street is
--    never saved (enforced below), so it can't be printed, published or seen.
-- 2. Where people go for a program: tick any of the organization's addresses, Remote, or
--    Unknown (resident_service_locations + location_remote / location_unknown). Unknown
--    stands alone. The app requires one tick to save.
-- 3. The "Where" filter now means where a program IS (a resident on foot needs Corvallis),
--    worked out from each address's city in the app. The old per-program "Where it's
--    available" tags (areas) are no longer used; the column is left in place.
-- 4. Existing data moves over:
--    - Each organization's Directory address becomes "Main address (from Directory)" and the
--      old single field is cleared (people's addresses are not touched).
--    - Each program's typed address becomes a labeled address on its organization, ticked for
--      that program. A confidential one keeps only its city. A program not in the Directory
--      keeps its old address in its staff notes instead.
--    - Drafts in "To review" whose organization has an address get it ticked, ready to check.
--      Drafts with no address stay blank for Resident Services to fill in.
--    - OHP and SNAP drafts are Remote (you apply by phone or online).
-- 5. Help lines move to Essential Phone Numbers (anyone can call; nothing to apply for): the
--    Oregon abuse reporting line, the Benton County mental health crisis line, ADRC and the
--    Love INC help line. Their drafts are archived. CARDV's draft is renamed "Confidential
--    emergency shelter" (its crisis line is already a phone number).
-- 6. Test data from the rollout demo: OSU / "SAMPLE" and the "SAMPLE PARTNERSHIPS" organization
--    are deleted. Programs stamped "checked by Susanna" (demo checks) lose that stamp, lose
--    the placeholder names "Test", "test 2", "test 3", and go back into "To review".
-- 7. get_public_resources() returns locations instead of one address.
-- 8. The duplicate check (0222) never lists a person, even one with no first/last name.

-- ─── 1. Addresses ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_addresses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  label       text        NOT NULL CHECK (nullif(trim(label), '') IS NOT NULL),
  street      text,
  city        text,
  is_private  boolean     NOT NULL DEFAULT false,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_addresses_has_place CHECK (nullif(trim(coalesce(street, '') || coalesce(city, '')), '') IS NOT NULL),
  -- A private location never stores its street.
  CONSTRAINT organization_addresses_private_city_only CHECK (NOT is_private OR (street IS NULL AND nullif(trim(city), '') IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS organization_addresses_partner_idx ON organization_addresses(partner_id);

DO $$ BEGIN
  CREATE TRIGGER organization_addresses_set_updated_at
    BEFORE UPDATE ON organization_addresses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Same reach as the Directory record itself, plus Resident Services for the organizations it
-- works with (like partner_contacts in 0206).
ALTER TABLE organization_addresses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY organization_addresses_all ON organization_addresses
    FOR ALL TO authenticated
    USING (
      partnerships_has_access()
      OR EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_id AND p.owner_id = auth.uid())
      OR (resident_services_has_access() AND partner_in_resident_services(partner_id))
    )
    WITH CHECK (
      partnerships_has_access()
      OR EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_id AND p.owner_id = auth.uid())
      OR (resident_services_has_access() AND partner_in_resident_services(partner_id))
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_addresses TO authenticated;

-- Adding an address while creating a program for an organization that isn't connected to
-- Resident Services yet (just added via "Can't find it?"): the table's rules don't let
-- Resident Services see it until the program is saved, so adding goes through this.
DROP FUNCTION IF EXISTS add_organization_address(uuid, text, text, text, boolean);
CREATE FUNCTION add_organization_address(
  p_partner_id uuid, p_label text, p_street text, p_city text, p_private boolean
) RETURNS TABLE (id uuid, partner_id uuid, label text, street text, city text, is_private boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (partnerships_has_access() OR resident_services_has_access()) THEN
    RAISE EXCEPTION 'You need Partnerships or Resident Services access to add an address.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM partners p WHERE p.id = p_partner_id AND p.first_name IS NULL AND p.last_name IS NULL
                   AND coalesce(p.sub_category::text, '') <> 'individual') THEN
    RAISE EXCEPTION 'That organization isn''t in the Directory.';
  END IF;
  INSERT INTO organization_addresses (partner_id, label, street, city, is_private)
  VALUES (p_partner_id, trim(p_label),
          CASE WHEN p_private THEN NULL ELSE nullif(trim(p_street), '') END,
          nullif(trim(p_city), ''), coalesce(p_private, false))
  RETURNING organization_addresses.id INTO v_id;
  RETURN QUERY SELECT a.id, a.partner_id, a.label, a.street, a.city, a.is_private
               FROM organization_addresses a WHERE a.id = v_id;
END $$;
REVOKE EXECUTE ON FUNCTION add_organization_address(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_organization_address(uuid, text, text, text, boolean) TO authenticated;

-- ─── 2. Where people go for a program ───────────────────────────────
ALTER TABLE resident_services ADD COLUMN IF NOT EXISTS location_remote  boolean NOT NULL DEFAULT false;
ALTER TABLE resident_services ADD COLUMN IF NOT EXISTS location_unknown boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE resident_services ADD CONSTRAINT resident_services_unknown_alone CHECK (NOT (location_unknown AND location_remote));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS resident_service_locations (
  service_id uuid NOT NULL REFERENCES resident_services(id) ON DELETE CASCADE,
  address_id uuid NOT NULL REFERENCES organization_addresses(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, address_id)
);
CREATE INDEX IF NOT EXISTS resident_service_locations_address_idx ON resident_service_locations(address_id);
ALTER TABLE resident_service_locations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY resident_service_locations_all ON resident_service_locations
    FOR ALL TO authenticated
    USING (resident_services_has_access())
    WITH CHECK (resident_services_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON resident_service_locations TO authenticated;

-- ─── 3. Help lines group on Essential Phone Numbers ─────────────────
ALTER TABLE resident_numbers DROP CONSTRAINT IF EXISTS resident_numbers_group_key_check;
ALTER TABLE resident_numbers ADD CONSTRAINT resident_numbers_group_key_check
  CHECK (group_key IN ('emergency', 'help', 'safety', 'offices', 'utilities', 'other'));

-- ─── 4–6. Data ──────────────────────────────────────────────────────
-- "123 Main St, Corvallis, OR 97333" → street "123 Main St", city "Corvallis".
-- "Albany, OR" → city only. "1625 NW Grant Ave" (no comma) → street only.
CREATE OR REPLACE FUNCTION pg_temp.split_address(p text, OUT street text, OUT city text) LANGUAGE plpgsql AS $$
DECLARE t text; parts text[];
BEGIN
  t := regexp_replace(trim(coalesce(p, '')), '\s*\n\s*', ', ', 'g');
  t := regexp_replace(t, ',?\s*\m(OR|Oregon)\M\.?\s*(\d{5}(-\d{4})?)?\s*$', '', 'i');
  t := regexp_replace(t, ',?\s*\d{5}(-\d{4})?\s*$', '');
  t := trim(both ' ,' from t);
  IF t = '' THEN RETURN; END IF;
  IF position(',' IN t) = 0 THEN
    IF t ~ '\d' THEN street := t; ELSE city := t; END IF;
    RETURN;
  END IF;
  parts := regexp_split_to_array(t, '\s*,\s*');
  city := nullif(trim(parts[array_length(parts, 1)]), '');
  street := nullif(trim(array_to_string(parts[1:array_length(parts, 1) - 1], ', ')), '');
  IF city ~ '\d' THEN street := t; city := NULL; END IF;
END $$;

DO $$
DECLARE
  r record; a record; v_addr uuid; v_susanna uuid; v_cardv uuid;
BEGIN
  SELECT id INTO v_susanna FROM profiles WHERE full_name = 'Susanna' LIMIT 1;

  -- 4a. Organizations' Directory addresses → their address list.
  FOR r IN
    SELECT p.id, p.address FROM partners p
    WHERE p.first_name IS NULL AND p.last_name IS NULL
      AND p.type NOT IN ('volunteer', 'prayer')
      AND coalesce(p.sub_category::text, '') <> 'individual'
      AND nullif(trim(p.address), '') IS NOT NULL
  LOOP
    SELECT * INTO a FROM pg_temp.split_address(r.address);
    IF a.street IS NOT NULL OR a.city IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM organization_addresses o
                      WHERE o.partner_id = r.id AND o.label = 'Main address (from Directory)') THEN
        INSERT INTO organization_addresses (partner_id, label, street, city, created_by)
        VALUES (r.id, 'Main address (from Directory)', a.street, a.city, NULL);
      END IF;
      UPDATE partners SET address = NULL WHERE id = r.id;
    END IF;
  END LOOP;

  -- 4b. Programs' typed addresses → a labeled address on the organization, ticked.
  FOR r IN
    SELECT s.id, s.partner_id, s.name, s.address, s.address_confidential, s.internal_notes
    FROM resident_services s
    WHERE nullif(trim(s.address), '') IS NOT NULL
  LOOP
    IF r.partner_id IS NULL THEN
      UPDATE resident_services
         SET internal_notes = concat_ws(E'\n\n', nullif(trim(internal_notes), ''), 'Address before Nov 2026: ' || r.address),
             address = NULL, address_confidential = false
       WHERE id = r.id;
      CONTINUE;
    END IF;
    SELECT * INTO a FROM pg_temp.split_address(r.address);
    v_addr := NULL;
    IF r.address_confidential THEN
      -- Private: keep the city only. The street is dropped.
      IF a.city IS NOT NULL THEN
        SELECT o.id INTO v_addr FROM organization_addresses o
         WHERE o.partner_id = r.partner_id AND o.is_private AND lower(o.city) = lower(a.city) LIMIT 1;
        IF v_addr IS NULL THEN
          INSERT INTO organization_addresses (partner_id, label, city, is_private, created_by)
          VALUES (r.partner_id, 'Private location', a.city, true, NULL) RETURNING id INTO v_addr;
        END IF;
      END IF;
    ELSE
      SELECT o.id INTO v_addr FROM organization_addresses o
       WHERE o.partner_id = r.partner_id AND NOT o.is_private
         AND lower(coalesce(o.street, '')) = lower(coalesce(a.street, ''))
         AND lower(coalesce(o.city, '')) = lower(coalesce(a.city, ''))
       LIMIT 1;
      IF v_addr IS NULL AND (a.street IS NOT NULL OR a.city IS NOT NULL) THEN
        INSERT INTO organization_addresses (partner_id, label, street, city, created_by)
        VALUES (r.partner_id, coalesce(nullif(trim(r.name), ''), 'Program location'), a.street, a.city, NULL)
        RETURNING id INTO v_addr;
      END IF;
    END IF;
    IF v_addr IS NOT NULL THEN
      INSERT INTO resident_service_locations (service_id, address_id) VALUES (r.id, v_addr) ON CONFLICT DO NOTHING;
    END IF;
    UPDATE resident_services SET address = NULL, address_confidential = false WHERE id = r.id;
  END LOOP;

  -- 4c. Drafts in "To review" with no location yet: tick the organization's Directory address.
  INSERT INTO resident_service_locations (service_id, address_id)
  SELECT s.id, o.id
  FROM resident_services s
  JOIN organization_addresses o ON o.partner_id = s.partner_id AND o.label = 'Main address (from Directory)'
  WHERE s.needs_review AND s.archived_at IS NULL
    AND NOT s.location_remote AND NOT s.location_unknown
    AND NOT EXISTS (SELECT 1 FROM resident_service_locations l WHERE l.service_id = s.id)
  ON CONFLICT DO NOTHING;

  -- 4d. OHP and SNAP: you apply by phone or online.
  UPDATE resident_services SET location_remote = true, location_unknown = false
   WHERE needs_review AND name IN ('Oregon Health Plan (OHP)', 'SNAP food benefits');

  -- 5. Help lines → Essential Phone Numbers; their drafts archived.
  INSERT INTO resident_numbers (group_key, name, phone, note, on_services_list, sort_order)
  SELECT v.g, v.n, v.p, v.note, false, v.o
  FROM (VALUES
    ('emergency', 'Report abuse of a child or adult (Oregon DHS)', '1-855-503-7233', '24 hours', 60),
    ('emergency', 'Benton County mental health crisis line', '1-888-232-7192', '24 hours', 70),
    ('help', 'Aging and Disability Resource Connection (ADRC)', '1-855-673-2372', 'Help for seniors, people with disabilities and their families', 10),
    ('help', 'Love INC help line', '541-757-8111', 'Connects people with help from local churches · Mon–Thu 9:30am–1:30pm', 20)
  ) AS v(g, n, p, note, o)
  WHERE NOT EXISTS (SELECT 1 FROM resident_numbers x WHERE x.name = v.n);

  UPDATE resident_services
     SET archived_at = now(),
         internal_notes = concat_ws(E'\n\n', nullif(trim(internal_notes), ''), 'Moved to Essential Phone Numbers (Nov 2026): it''s a help line anyone can call, not a program.')
   WHERE needs_review AND archived_at IS NULL
     AND name IN ('Report abuse (Child and Adult Protective Services)',
                  'Aging and Disability Resource Connection (ADRC)',
                  'Help line (connects people with local church help)');

  UPDATE resident_services
     SET name = 'Confidential emergency shelter',
         internal_notes = concat_ws(E'\n\n', nullif(trim(internal_notes), ''), 'Renamed Nov 2026: the crisis line (541-754-0110) is on Essential Phone Numbers. This program is the shelter. Add its city as a private location; never its street.')
   WHERE needs_review AND name = '24-hour crisis line and confidential shelter';

  -- 6. Test data.
  DELETE FROM resident_services
   WHERE partner_id IS NULL AND provider_name ILIKE 'OSU%' AND lower(trim(name)) = 'sample';

  FOR r IN SELECT id FROM partners WHERE lower(trim(name)) = 'sample partnerships' AND first_name IS NULL LOOP
    DELETE FROM resident_services WHERE partner_id = r.id;   -- programs can't lose their organization
    DELETE FROM partners WHERE id = r.id;                    -- contacts, reviews, touchpoints go with it
  END LOOP;

  -- Demo checks: back into "To review" with the stamp and placeholder names cleared.
  IF v_susanna IS NOT NULL THEN
    ALTER TABLE resident_service_reviews DISABLE TRIGGER resident_service_reviews_emit;
    FOR r IN
      SELECT s.id, s.partner_id, s.name FROM resident_services s
      WHERE s.last_checked_by = v_susanna AND NOT s.needs_review AND s.archived_at IS NULL
    LOOP
      UPDATE resident_services
         SET name = CASE WHEN lower(trim(name)) IN ('test', 'test 2', 'test 3', 'test2', 'test3') THEN '' ELSE name END,
             last_checked_at = NULL, last_checked_by = NULL, last_checked_how = NULL,
             published_at = NULL,
             -- Only programs with a Directory organization can wait in "To review".
             needs_review = (r.partner_id IS NOT NULL)
       WHERE id = r.id;
      IF r.partner_id IS NOT NULL THEN
        INSERT INTO resident_service_reviews (partner_id, sent_by)
        VALUES (r.partner_id, v_susanna)
        ON CONFLICT (partner_id) WHERE reviewed_at IS NULL DO NOTHING;
      END IF;
    END LOOP;
    ALTER TABLE resident_service_reviews ENABLE TRIGGER resident_service_reviews_emit;
  END IF;

  -- Anything on the main list with no location at all is Unknown, so it gets filled in.
  UPDATE resident_services s SET location_unknown = true
   WHERE NOT s.needs_review AND s.archived_at IS NULL
     AND NOT s.location_remote AND NOT s.location_unknown
     AND NOT EXISTS (SELECT 1 FROM resident_service_locations l WHERE l.service_id = s.id);
END $$;

-- ─── 7. Public list ─────────────────────────────────────────────────
-- Remote shows "Remote"; Unknown shows nothing; a private location shows its city only (its
-- street was never stored).
DROP FUNCTION IF EXISTS get_public_resources();
CREATE FUNCTION get_public_resources()
RETURNS TABLE (
  id uuid, provider text, service text, service_type text, serves text[],
  help_phone text, hours text, how_to_access text, website text,
  last_checked_at timestamptz, remote boolean, locations jsonb
)
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT s.id,
         COALESCE(p.name, s.provider_name),
         s.name, s.service_type, s.serves,
         s.help_phone, s.hours, s.how_to_access,
         COALESCE(s.website, p.website),
         s.last_checked_at,
         s.location_remote,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'label', o.label, 'street', CASE WHEN o.is_private THEN NULL ELSE o.street END,
                    'city', o.city, 'private', o.is_private) ORDER BY o.label)
           FROM resident_service_locations l
           JOIN organization_addresses o ON o.id = l.address_id
           WHERE l.service_id = s.id AND NOT s.location_unknown
         ), '[]'::jsonb)
  FROM resident_services s
  LEFT JOIN partners p ON p.id = s.partner_id
  WHERE s.published_at IS NOT NULL
    AND s.archived_at IS NULL
    AND NOT s.needs_review
    AND s.last_checked_at >= now() - interval '2 years'
  ORDER BY s.service_type, COALESCE(p.name, s.provider_name), s.name;
$$;
REVOKE EXECUTE ON FUNCTION get_public_resources() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_resources() TO anon, authenticated;

-- ─── 8. The duplicate check and "Use this one" never offer a person ─
-- (0222 left out people by first/last name; a person record can have neither, so the
-- record's own "individual" category is checked too.)
DROP FUNCTION IF EXISTS rs_find_similar_organizations(text, text, text);
CREATE FUNCTION rs_find_similar_organizations(p_name text, p_phone text DEFAULT NULL, p_website text DEFAULT NULL)
RETURNS TABLE (id uuid, name text, reason text, in_resident_services boolean, inactive boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_norm     text := org_name_norm(p_name);
  v_compact  text := org_name_compact(p_name);
  v_initials text := org_name_initials(p_name);
  v_phone    text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_domain   text := org_website_domain(p_website);
BEGIN
  IF NOT resident_services_has_access() THEN
    RETURN;
  END IF;
  IF length(v_phone) < 7 THEN v_phone := NULL; END IF;

  RETURN QUERY
  WITH orgs AS (
    -- Organizations only: never a person (donor, volunteer, prayer partner).
    SELECT p.id, p.name, p.phone, p.website, p.stage,
           org_name_norm(p.name) AS n, org_name_compact(p.name) AS c, org_name_initials(p.name) AS ini
    FROM partners p
    WHERE p.first_name IS NULL AND p.last_name IS NULL
      AND p.type NOT IN ('volunteer', 'prayer')
      AND coalesce(p.sub_category::text, '') <> 'individual'
  ),
  scored AS (
    SELECT o.id, o.name, o.stage,
      CASE
        WHEN v_phone IS NOT NULL AND right(regexp_replace(coalesce(o.phone, ''), '\D', '', 'g'), 10) = v_phone THEN 'Same phone number'
        WHEN v_domain IS NOT NULL AND org_website_domain(o.website) = v_domain THEN 'Same website'
        WHEN length(v_compact) >= 3 AND o.c = v_compact THEN 'Same name'
        WHEN length(v_compact) >= 4 AND length(o.c) >= 3 AND (position(o.c IN v_compact) > 0 OR position(v_compact IN o.c) > 0) THEN 'Similar name'
        WHEN length(v_compact) >= 3 AND length(o.ini) >= 3 AND (o.ini = v_compact OR position(o.ini IN v_compact) = 1) THEN 'Its initials match'
        WHEN length(v_initials) >= 3 AND length(o.c) >= 3 AND (v_initials = o.c OR position(o.c IN v_initials) = 1) THEN 'Its initials match'
        WHEN length(v_norm) >= 3 AND similarity(o.n, v_norm) >= 0.3 THEN 'Similar spelling'
      END AS reason,
      CASE
        WHEN v_phone IS NOT NULL AND right(regexp_replace(coalesce(o.phone, ''), '\D', '', 'g'), 10) = v_phone THEN 2.0
        WHEN v_domain IS NOT NULL AND org_website_domain(o.website) = v_domain THEN 1.9
        WHEN o.c = v_compact THEN 1.5
        ELSE greatest(similarity(o.n, v_norm), 0) + 0.5
      END AS score
    FROM orgs o
  )
  SELECT s.id, s.name, s.reason, partner_in_resident_services(s.id), (s.stage = 'inactive')
  FROM scored s
  WHERE s.reason IS NOT NULL
  ORDER BY s.score DESC, s.name
  LIMIT 8;
END $$;

REVOKE EXECUTE ON FUNCTION rs_find_similar_organizations(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rs_find_similar_organizations(text, text, text) TO authenticated;

DROP FUNCTION IF EXISTS rs_link_organization(uuid, boolean);
CREATE FUNCTION rs_link_organization(p_partner_id uuid, p_open_review boolean DEFAULT true)
RETURNS TABLE (id uuid, name text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name    text;
  v_already boolean;
  v_who     text := (SELECT full_name FROM profiles WHERE profiles.id = auth.uid());
BEGIN
  IF NOT resident_services_has_access() THEN
    RAISE EXCEPTION 'You need Resident Services access to do this.';
  END IF;
  SELECT p.name INTO v_name FROM partners p
   WHERE p.id = p_partner_id AND p.first_name IS NULL AND p.last_name IS NULL
     AND p.type NOT IN ('volunteer', 'prayer')
     AND coalesce(p.sub_category::text, '') <> 'individual';
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'That organization isn''t in the Directory.';
  END IF;

  v_already := partner_in_resident_services(p_partner_id);

  IF p_open_review AND NOT v_already THEN
    INSERT INTO resident_service_reviews (partner_id, sent_by, added_by_resident_services)
    VALUES (p_partner_id, auth.uid(), true)
    ON CONFLICT (partner_id) WHERE reviewed_at IS NULL DO NOTHING;
  END IF;

  IF NOT v_already THEN
    PERFORM rs_tell_partnerships(
      'rs_linked_org:' || p_partner_id,
      'Resident Services is now listing programs from ' || v_name,
      COALESCE(v_who, 'Resident Services') || ' connected ' || v_name || ' to the Resident Services room, '
        || 'so Resident Services staff can now see its Directory record (contacts, notes, latest touchpoint) '
        || 'inside its programs. Nothing to do unless something on the record shouldn''t be shared. Then mark this done.'
    );
  END IF;

  RETURN QUERY SELECT p_partner_id, v_name;
END $$;
REVOKE EXECUTE ON FUNCTION rs_link_organization(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rs_link_organization(uuid, boolean) TO authenticated;
