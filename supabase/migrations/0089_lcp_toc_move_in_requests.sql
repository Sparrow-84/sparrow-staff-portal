-- Sparrow — LCP → Twin Oaks move-in review queue
-- Replaces the earlier silent auto-sync (sync_lcp_family_to_toc, from 0087) with
-- a queue TOC staff actually triage: they see it happening, can leave a note, and
-- explicitly approve before a resident record is created. Once approved/linked,
-- ongoing edits on the LCP side (contact info, move-in date, emergency contact)
-- sync automatically — no re-approval needed for routine updates, only for the
-- one-time creation of a new resident record.
-- Depends on: 0087_lcp_program_fee.sql, 0002_twin_oaks.sql (spaces/tenants/household_members)
-- Safe to re-run: tables/columns use IF NOT EXISTS/guards; types use DO/EXCEPTION.

DO $$ BEGIN
  CREATE TYPE lcp_toc_request_status AS ENUM ('pending', 'needs_info', 'approved');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- family_display_name / space_label are denormalized snapshots, not live joins —
-- families is only directly readable by lcp_role='full' staff (see 0005_lcp.sql's
-- families_select policy), so a plain PostgREST embed of families(display_name)
-- would come back blank for TOC-only staff. Capturing the label at request time
-- avoids that RLS gap entirely for the list view; the detail drawer instead calls
-- fetch_lcp_move_in_request_detail() (below) for live, permission-checked data.
CREATE TABLE IF NOT EXISTS lcp_toc_move_in_requests (
  id                  uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid                    NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  toc_space_id        uuid                    NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  family_display_name text                    NOT NULL,
  space_label         text                    NOT NULL,
  status              lcp_toc_request_status  NOT NULL DEFAULT 'pending',
  notes               text,
  requested_at        timestamptz             NOT NULL DEFAULT now(),
  reviewed_by         uuid                    REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  updated_at          timestamptz             NOT NULL DEFAULT now()
);

-- Only one open (pending/needs_info) request per family at a time.
CREATE UNIQUE INDEX IF NOT EXISTS lcp_toc_move_in_requests_open_family_idx
  ON lcp_toc_move_in_requests(family_id) WHERE status != 'approved';

CREATE OR REPLACE FUNCTION touch_lcp_toc_request_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER lcp_toc_move_in_requests_updated_at
    BEFORE UPDATE ON lcp_toc_move_in_requests
    FOR EACH ROW EXECUTE FUNCTION touch_lcp_toc_request_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE lcp_toc_move_in_requests ENABLE ROW LEVEL SECURITY;

-- Shared coordination record — either side can see and update it (LCP staff
-- respond to a "needs info" note; TOC staff triage and approve).
DO $$ BEGIN
  CREATE POLICY "lcp_toc_requests_select"
    ON lcp_toc_move_in_requests FOR SELECT
    TO authenticated
    USING (lcp_has_access() OR can_see_residents());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "lcp_toc_requests_insert"
    ON lcp_toc_move_in_requests FOR INSERT
    TO authenticated
    WITH CHECK (lcp_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "lcp_toc_requests_update"
    ON lcp_toc_move_in_requests FOR UPDATE
    TO authenticated
    USING (lcp_has_access() OR can_see_residents())
    WITH CHECK (lcp_has_access() OR can_see_residents());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Links between a family and its (eventual) Twin Oaks resident record ──────

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS toc_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

-- Marks which household_members rows are LCP-sourced vs. added directly by TOC
-- staff, so ongoing sync only ever touches rows it owns and never an
-- independently-added household member (e.g. a grandmother TOC staff added
-- later who was never in the LCP system).
ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS lcp_household_adult_id uuid REFERENCES lcp_household_adults(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS household_members_lcp_adult_idx
  ON household_members(lcp_household_adult_id) WHERE lcp_household_adult_id IS NOT NULL;

-- ─── Drop the old one-shot auto-sync (unshipped, replaced by the queue) ───────
DROP FUNCTION IF EXISTS sync_lcp_family_to_toc(uuid);

-- ─── Request (or, once linked, silently sync) ─────────────────────────────────
-- Called from the LCP side after saving a move-in date, home unit, or household
-- member edit. If the family isn't linked to a Twin Oaks resident yet, this
-- creates/keeps a pending request for TOC staff to review — it never writes
-- into tenants/household_members itself. If the family IS already linked
-- (TOC staff already approved once), it pushes the LCP-owned fields (contact
-- info, move-in date, emergency contact, children's names) into the existing
-- tenant + household_members records — no re-approval needed for routine
-- updates, only for creating a brand-new resident record.
CREATE OR REPLACE FUNCTION request_or_sync_lcp_toc(p_family_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fam families%ROWTYPE;
  first_adult lcp_household_adults%ROWTYPE;
  adult_count int;
  kids text;
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

-- ─── Live detail for the review drawer (TOC or LCP staff) ─────────────────────
-- families is only directly readable by lcp_role='full' staff, so TOC-only
-- staff need this security-definer path to see the resident-relevant preview
-- (household adults, emergency contact, move-in date) for a specific request —
-- nothing else about the family is exposed.
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
    'adults', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'full_name', full_name, 'phone', phone, 'email', email, 'children_names', children_names
      )), '[]'::jsonb)
      FROM lcp_household_adults WHERE family_id = req.family_id
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ─── Approve (TOC staff only) ───────────────────────────────────────────────────
-- Creates the actual tenant + household_members records from the family's
-- current data, links the family to that tenant, and marks the request
-- approved. Never overwrites an existing active tenant for that space.
CREATE OR REPLACE FUNCTION approve_lcp_toc_move_in(p_request_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  req lcp_toc_move_in_requests%ROWTYPE;
  fam families%ROWTYPE;
  existing_tenant_id uuid;
  new_tenant_id uuid;
  first_adult lcp_household_adults%ROWTYPE;
  adult_count int;
  kids text;
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
  SELECT * INTO first_adult FROM lcp_household_adults WHERE family_id = req.family_id ORDER BY created_at LIMIT 1;
  SELECT count(*) INTO adult_count FROM lcp_household_adults WHERE family_id = req.family_id;
  SELECT string_agg(DISTINCT children_names, '; ') INTO kids FROM lcp_household_adults WHERE family_id = req.family_id;

  INSERT INTO tenants (space_id, name, phone, email, household_size, status, move_in_date, children_names, emergency_contact_notes)
  VALUES (
    req.toc_space_id, fam.display_name, first_adult.phone, first_adult.email,
    GREATEST(adult_count, 1), 'active', fam.move_in_date, kids, fam.emergency_contact_notes
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
