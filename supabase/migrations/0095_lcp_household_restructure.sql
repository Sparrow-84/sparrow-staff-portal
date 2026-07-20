-- Sparrow — LCP household restructure + a pre-existing Twin Oaks bug fix
--
-- Pre-existing bug found while testing the LCP->TOC sync (unrelated to that
-- work): the Twin Oaks tenant form has always saved a "Number of children"
-- count to tenants.children, but that column never existed — only
-- children_names (text) does. Every tenant save has been silently including
-- a write to a nonexistent column. Adding it now rather than ripping out the
-- working UI that already assumes it's there.
--
-- LCP household restructure, from Susanna's testing feedback:
-- - families.display_name is now the household's last name/label (not an
--   individual mother's name) — matches how Twin Oaks already models a
--   household (tenant "name" = household label, individual adults listed
--   separately). No column change needed, just what staff type into it going
--   forward.
-- - Exactly one adult per family now (was an open-ended list nobody asked
--   for) — drops the confusing "+ Add adult" flow for the one person who's
--   already shown at the top of the panel. lcp_household_adults keeps its
--   shape (minus children_names, which moves out) but the app now only ever
--   has one row per family.
-- - Children get their own table, one row each ("a separate field for each
--   child") — cleaner data entry than a single free-text blob, while the
--   sync to Twin Oaks still collapses them into that side's own
--   count-plus-joined-names fields so nothing about TOC's existing form
--   needs to change.
--
-- Depends on: 0087, 0089 (lcp_household_adults, the move-in queue + sync
-- functions), 0002_twin_oaks.sql (tenants).
-- Safe to re-run: ADD/DROP COLUMN use IF [NOT] EXISTS; functions are
-- CREATE OR REPLACE.

-- ─── Fix the pre-existing Twin Oaks bug ────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS children integer NOT NULL DEFAULT 0;

-- ─── Children get their own table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lcp_household_children (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  full_name  text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lcp_household_children_family_idx ON lcp_household_children(family_id);

ALTER TABLE lcp_household_children ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lcp_staff_household_children_all"
    ON lcp_household_children FOR ALL
    TO authenticated
    USING (lcp_has_access())
    WITH CHECK (lcp_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE lcp_household_adults DROP COLUMN IF EXISTS children_names;

-- ─── Ongoing sync: single adult + children table, matching Twin Oaks' own
-- count-plus-joined-names shape on the tenant side ──────────────────────────────
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
      email = adult.email,
      children = child_count,
      children_names = kid_names,
      move_in_date = fam.move_in_date,
      emergency_contact_notes = fam.emergency_contact_notes,
      household_size = (CASE WHEN adult.id IS NULL THEN 0 ELSE 1 END) + child_count
    WHERE id = fam.toc_tenant_id;

    INSERT INTO household_members (space_id, tenant_id, name, phone, email, lcp_household_adult_id)
    SELECT fam.toc_space_id, fam.toc_tenant_id, full_name, phone, email, id
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

-- ─── Approve: same single-adult + children-table shape ────────────────────────
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
    req.toc_space_id, fam.display_name, adult.phone, adult.email,
    (CASE WHEN adult.id IS NULL THEN 0 ELSE 1 END) + child_count,
    'active', fam.move_in_date, child_count, kid_names, fam.emergency_contact_notes
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO household_members (space_id, tenant_id, name, phone, email, lcp_household_adult_id)
  SELECT req.toc_space_id, new_tenant_id, full_name, phone, email, id
  FROM lcp_household_adults WHERE family_id = req.family_id;

  UPDATE spaces SET status = 'occupied' WHERE id = req.toc_space_id AND status != 'occupied';
  UPDATE families SET toc_tenant_id = new_tenant_id, toc_synced_at = now() WHERE id = req.family_id;
  UPDATE lcp_toc_move_in_requests SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_request_id;

  RETURN 'approved';
END;
$$;

-- ─── Review-drawer detail: single adult object + a plain array of child names ─
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
      SELECT jsonb_build_object('full_name', full_name, 'phone', phone, 'email', email)
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
