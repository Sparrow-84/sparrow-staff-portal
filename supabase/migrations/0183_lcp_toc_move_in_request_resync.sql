-- Migration 0183: fix request_or_sync_lcp_toc() silently ignoring a corrected
-- home unit while a move-in request is still pending/needs_info.
--
-- Real bug found 2026-10-14: two LCP families were set to move into Unit 33
-- before Lot 49 (Rest Haven RV) existed as an LCP-designated space. Pending
-- Twin Oaks move-in requests were created pointed at Unit 33. Once Shelly
-- corrects the family's Home Unit to 49 on the LCP side and re-saves, the app
-- already tells her this is exactly what to do (see SyncStatus's "update this
-- family's info here" copy in FamilyDetailPanel.tsx) -- but the function below
-- silently did nothing in this case: it only ever either creates a brand-new
-- request (when none exists) or syncs an already-approved tenant. An existing
-- *open* (pending/needs_info) request just short-circuited to
-- 'already_requested' with no update at all, leaving Twin Oaks staff looking
-- at a stale request still pointed at the wrong unit forever, with no way to
-- fix it short of a direct DB edit.
--
-- Fix: when an open request already exists and the family's toc_space_id has
-- since changed, update that request's toc_space_id/space_label to match (and
-- reset status to 'pending' so Twin Oaks staff see it as fresh/unreviewed even
-- if it had been marked needs_info for an unrelated reason) instead of no-op.
-- Any notes already on the request are left untouched -- they may be about
-- something unrelated to the unit (e.g. "need annual income first").

CREATE OR REPLACE FUNCTION request_or_sync_lcp_toc(p_family_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fam families%ROWTYPE;
  first_adult lcp_household_adults%ROWTYPE;
  adult_count int;
  kids text;
  existing_req lcp_toc_move_in_requests%ROWTYPE;
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
    SELECT * INTO first_adult FROM lcp_household_adults WHERE family_id = p_family_id ORDER BY created_at LIMIT 1;
    SELECT count(*) INTO adult_count FROM lcp_household_adults WHERE family_id = p_family_id;
    SELECT string_agg(DISTINCT children_names, '; ') INTO kids FROM lcp_household_adults WHERE family_id = p_family_id;

    UPDATE tenants SET
      phone = first_adult.phone,
      email = first_adult.email,
      children_names = kids,
      move_in_date = fam.move_in_date,
      emergency_contact_notes = fam.emergency_contact_notes,
      household_size = GREATEST(adult_count, 1)
    WHERE id = fam.toc_tenant_id;

    INSERT INTO household_members (space_id, tenant_id, name, phone, email, lcp_household_adult_id)
    SELECT fam.toc_space_id, fam.toc_tenant_id, full_name, phone, email, id
    FROM lcp_household_adults WHERE family_id = p_family_id
    ON CONFLICT (lcp_household_adult_id) WHERE lcp_household_adult_id IS NOT NULL
    DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email;

    DELETE FROM household_members
    WHERE tenant_id = fam.toc_tenant_id
      AND lcp_household_adult_id IS NOT NULL
      AND lcp_household_adult_id NOT IN (SELECT id FROM lcp_household_adults WHERE family_id = p_family_id);

    RETURN 'synced';
  END IF;

  SELECT * INTO existing_req FROM lcp_toc_move_in_requests
    WHERE family_id = p_family_id AND status != 'approved';
  IF existing_req.id IS NOT NULL THEN
    IF existing_req.toc_space_id IS DISTINCT FROM fam.toc_space_id THEN
      UPDATE lcp_toc_move_in_requests
      SET toc_space_id = fam.toc_space_id,
          space_label = (SELECT label FROM spaces WHERE id = fam.toc_space_id),
          status = 'pending'
      WHERE id = existing_req.id;
      RETURN 'request_updated';
    END IF;
    RETURN 'already_requested';
  END IF;

  INSERT INTO lcp_toc_move_in_requests (family_id, toc_space_id, family_display_name, space_label)
  VALUES (p_family_id, fam.toc_space_id, fam.display_name, (SELECT label FROM spaces WHERE id = fam.toc_space_id));
  RETURN 'request_created';
END;
$$;
