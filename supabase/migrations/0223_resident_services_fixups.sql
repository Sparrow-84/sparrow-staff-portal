-- 0223: Fix-ups after 0216-0222 were run (2026-11-12). Safe to run more than once.
--
-- 1. "Add as a new organization" no longer asks what kind of organization it is (Partnerships
--    sets that). 0222 was run before that change, so the database still has the older
--    rs_add_organization() that requires it, and the room's button fails. This swaps in the
--    new version: rs_add_organization(name, phone, website, open_review).
--
-- 2. Area tags on the drafted programs from the Community Resources sheet (0218) and CARDV's
--    crisis line (0216), after the "Where" filter changed: picking Corvallis or Philomath now
--    shows only programs tagged with that town (Benton County still includes both towns), so
--    programs for the whole county need the towns tagged too. Only programs still waiting in
--    "To review" are touched, so nothing a person has already checked is changed.

-- ─── 1. "Add as a new organization" ─────────────────────────────────
-- No category is asked for: the Partnerships room admin sets it from their task.
DROP FUNCTION IF EXISTS rs_add_organization(text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS rs_add_organization(text, text, text, boolean);
CREATE FUNCTION rs_add_organization(
  p_name text, p_phone text DEFAULT NULL, p_website text DEFAULT NULL, p_open_review boolean DEFAULT true
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id   uuid;
  v_who  text := (SELECT full_name FROM profiles WHERE id = auth.uid());
  v_name text := nullif(trim(p_name), '');
BEGIN
  IF NOT resident_services_has_access() THEN
    RAISE EXCEPTION 'You need Resident Services access to add an organization.';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Type the organization''s name.';
  END IF;
  INSERT INTO partners (name, type, stage, owner_id, source, phone, website)
  VALUES (v_name, 'community', 'prospect',
          partnerships_room_admin_id(),
          'Added by Resident Services' || COALESCE(' (' || v_who || ')', '') || ', ' || to_char(current_date, 'Mon FMDD, YYYY'),
          nullif(trim(p_phone), ''), nullif(trim(p_website), ''))
  RETURNING id INTO v_id;

  IF p_open_review THEN
    INSERT INTO resident_service_reviews (partner_id, sent_by, added_by_resident_services)
    VALUES (v_id, auth.uid(), true)
    ON CONFLICT (partner_id) WHERE reviewed_at IS NULL DO NOTHING;
  END IF;

  PERFORM rs_tell_partnerships(
    'rs_new_org:' || v_id,
    'New organization added by Resident Services — ' || v_name,
    COALESCE(v_who, 'Resident Services') || ' added ' || v_name || ' to the Directory from the Resident Services room, '
      || 'because residents can use something they offer. It''s a Prospect owned by you. '
      || 'Check it isn''t a duplicate of a record already in the Directory, set its categories, '
      || 'and decide whether there''s a relationship to build. Then mark this done.'
  );
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION rs_add_organization(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rs_add_organization(text, text, text, boolean) TO authenticated;

-- ─── 2. Area tags on drafts still waiting for review ────────────────
-- Programs for the three counties: add both towns.
UPDATE resident_services
   SET areas = ARRAY['Corvallis', 'Philomath', 'Benton County', 'Linn County', 'Lincoln County']
 WHERE needs_review
   AND areas @> ARRAY['Benton County', 'Linn County', 'Lincoln County']
   AND NOT areas @> ARRAY['Corvallis', 'Philomath'];

-- County-wide Benton programs: add both towns.
UPDATE resident_services
   SET areas = ARRAY['Corvallis', 'Philomath', 'Benton County']
 WHERE needs_review
   AND name IN ('Mental health (Benton County Behavioral Health)', 'Emergency financial help')
   AND NOT areas @> ARRAY['Philomath'];

-- Meals on Wheels and CARDV's crisis line serve both towns too.
UPDATE resident_services
   SET areas = ARRAY['Corvallis', 'Philomath', 'Benton County', 'Linn County']
 WHERE needs_review
   AND (name = 'Meals on Wheels' OR help_phone = '541-754-0110')
   AND NOT areas @> ARRAY['Philomath'];

-- The Gleaners are in Philomath only.
UPDATE resident_services
   SET areas = ARRAY['Philomath']
 WHERE needs_review
   AND name = 'Philomath Community Gleaners'
   AND areas IS DISTINCT FROM ARRAY['Philomath'];
