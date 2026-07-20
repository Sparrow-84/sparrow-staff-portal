-- Sparrow — LCP: the household adult's email is just the sign-in email
-- Susanna caught that Add Family had two email fields (sign-in email, and a
-- separate "adult" email) — since the mother is always the one who signs in,
-- these were always meant to be the same thing. Drops the separate column;
-- everywhere the adult's email is needed now reads families.login_email.
-- Depends on: 0087_lcp_program_fee.sql, 0095_lcp_household_restructure.sql
-- Safe to re-run: DROP COLUMN uses IF EXISTS; functions are CREATE OR REPLACE.

ALTER TABLE lcp_household_adults DROP COLUMN IF EXISTS email;

CREATE OR REPLACE FUNCTION request_or_sync_lcp_toc(p_family_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fam families%ROWTYPE;
  adult lcp_household_adults%ROWTYPE;
  child_count int;
  kid_names text;
  existing_request_id uuid;
BEGIN
  IF NOT lcp_has_access() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO fam FROM families WHERE id = p_family_id;
  IF fam IS NULL THEN
    RETURN 'not_found';
  END IF;
  IF fam.toc_space_id IS NULL OR fam.move_in_date IS NULL THEN
    RETURN 'incomplete';
  END IF;

  IF fam.toc_tenant_id IS NOT NULL THEN
    SELECT * INTO adult FROM lcp_household_adults WHERE family_id = p_family_id LIMIT 1;
    SELECT count(*) INTO child_count FROM lcp_household_children WHERE family_id = p_family_id;
    SELECT string_agg(full_name, ', ') INTO kid_names FROM lcp_household_children WHERE family_id = p_family_id;

    UPDATE tenants SET
      phone = adult.phone,
      email = fam.login_email,
      children = child_count,
      children_names = kid_names,
      move_in_date = fam.move_in_date,
      emergency_contact_notes = fam.emergency_contact_notes,
      household_size = (CASE WHEN adult.id IS NULL THEN 0 ELSE 1 END) + child_count
    WHERE id = fam.toc_tenant_id;

    INSERT INTO household_members (space_id, tenant_id, name, phone, email, lcp_household_adult_id)
    SELECT fam.toc_space_id, fam.toc_tenant_id, full_name, phone, fam.login_email, id
    FROM lcp_household_adults WHERE family_id = p_family_id
    ON CONFLICT (lcp_household_adult_id) WHERE lcp_household_adult_id IS NOT NULL
    DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email;

    RETURN 'synced';
  END IF;

  SELECT id INTO existing_request_id FROM lcp_toc_move_in_requests
    WHERE family_id = p_family_id AND status != 'approved';
  IF existing_request_id IS NOT NULL THEN
    RETURN 'already_requested';
  END IF;

  INSERT INTO lcp_toc_move_in_requests (family_id, toc_space_id, family_display_name, space_label)
  VALUES (p_family_id, fam.toc_space_id, fam.display_name, (SELECT label FROM spaces WHERE id = fam.toc_space_id));
  RETURN 'request_created';
END;
$$;

CREATE OR REPLACE FUNCTION approve_lcp_toc_move_in(p_request_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  req lcp_toc_move_in_requests%ROWTYPE;
  fam families%ROWTYPE;
  existing_tenant_id uuid;
  new_tenant_id uuid;
  adult lcp_household_adults%ROWTYPE;
  child_count int;
  kid_names text;
BEGIN
  IF NOT can_see_residents() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO req FROM lcp_toc_move_in_requests WHERE id = p_request_id;
  IF req IS NULL THEN
    RETURN 'not_found';
  END IF;
  IF req.status = 'approved' THEN
    RETURN 'already_approved';
  END IF;

  SELECT id INTO existing_tenant_id FROM tenants WHERE space_id = req.toc_space_id AND status = 'active' LIMIT 1;
  IF existing_tenant_id IS NOT NULL THEN
    RETURN 'skipped_existing_tenant';
  END IF;

  SELECT * INTO fam FROM families WHERE id = req.family_id;
  SELECT * INTO adult FROM lcp_household_adults WHERE family_id = req.family_id LIMIT 1;
  SELECT count(*) INTO child_count FROM lcp_household_children WHERE family_id = req.family_id;
  SELECT string_agg(full_name, ', ') INTO kid_names FROM lcp_household_children WHERE family_id = req.family_id;

  INSERT INTO tenants (space_id, name, phone, email, household_size, status, move_in_date, children, children_names, emergency_contact_notes)
  VALUES (
    req.toc_space_id, fam.display_name, adult.phone, fam.login_email,
    (CASE WHEN adult.id IS NULL THEN 0 ELSE 1 END) + child_count,
    'active', fam.move_in_date, child_count, kid_names, fam.emergency_contact_notes
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO household_members (space_id, tenant_id, name, phone, email, lcp_household_adult_id)
  SELECT req.toc_space_id, new_tenant_id, full_name, phone, fam.login_email, id
  FROM lcp_household_adults WHERE family_id = req.family_id;

  UPDATE spaces SET status = 'occupied' WHERE id = req.toc_space_id AND status != 'occupied';
  UPDATE families SET toc_tenant_id = new_tenant_id, toc_synced_at = now() WHERE id = req.family_id;
  UPDATE lcp_toc_move_in_requests SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_request_id;

  RETURN 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION fetch_lcp_move_in_request_detail(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  req lcp_toc_move_in_requests%ROWTYPE;
  fam families%ROWTYPE;
  result jsonb;
BEGIN
  IF NOT (lcp_has_access() OR can_see_residents()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO req FROM lcp_toc_move_in_requests WHERE id = p_request_id;
  IF req IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO fam FROM families WHERE id = req.family_id;

  SELECT jsonb_build_object(
    'family_display_name', fam.display_name,
    'move_in_date', fam.move_in_date,
    'emergency_contact_notes', fam.emergency_contact_notes,
    'space_label', req.space_label,
    'adult', (
      SELECT jsonb_build_object('full_name', full_name, 'phone', phone, 'email', fam.login_email)
      FROM lcp_household_adults WHERE family_id = req.family_id LIMIT 1
    ),
    'children', (
      SELECT coalesce(jsonb_agg(full_name), '[]'::jsonb)
      FROM lcp_household_children WHERE family_id = req.family_id
    )
  ) INTO result;

  RETURN result;
END;
$$;
