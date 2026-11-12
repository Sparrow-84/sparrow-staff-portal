-- 0222: Resident Services staff can add a new organization to the Directory themselves.
--
-- Before: Resident Services staff could only see Directory records already connected to
-- Resident Services, so they couldn't tell whether an organization was already in the
-- Directory, and couldn't add one. They had to wait for Partnerships, or add the program
-- as "Not in the Directory" (a second, disconnected record).
--
-- Now, from the Resident Services room ("+ Add an organization", or "Can't find it?" inside
-- "+ Add a program"):
--   1. rs_find_similar_organizations() checks the WHOLE Directory for a likely match before
--      anything is created: name contains / is contained in ("CARDVA" finds "CARDV"), close
--      spelling (pg_trgm), punctuation and filler words ignored ("C.H.A.N.C.E." = "CHANCE"),
--      first letters of a long name ("Center Against Rape and Domestic Violence" = "CARDV"),
--      same phone number, same website. It returns names only -- never the record itself,
--      and never people (donors, volunteers).
--   2. rs_link_organization() -- "Use this one": connects an existing record to Resident
--      Services (decided 2026-11-12: link right away, Partnerships is told).
--   3. rs_add_organization() -- "Add as a new organization": creates the Directory record (Prospect,
--      owned by the Partnerships room admin, source says Resident Services added it).
--   Either way, the Partnerships room admin gets a task, which also shows on Partnerships
--   Home ("crm" + department partnerships, like the other Partnerships reminders).
--
-- An organization added (or connected) from the room's own button opens straight into its own
-- page to add programs. Programs added there go straight onto the list. If it's closed with
-- no programs yet, it waits in "To review" (added_by_resident_services) so it isn't lost. It
-- never sends the room admin a "Partnerships sent this" task, since they added it themselves.
-- No category is asked for when adding: the Partnerships room admin sets it.
--
-- Safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── 1. "To review" rows a Resident Services person added themselves ───
ALTER TABLE resident_service_reviews
  ADD COLUMN IF NOT EXISTS added_by_resident_services boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION resident_service_review_emit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a record;
  v_org    text := (SELECT name FROM partners WHERE id = NEW.partner_id);
  v_sender text := (SELECT full_name FROM profiles WHERE id = NEW.sent_by);
BEGIN
  -- They added it themselves; it's already in front of them in "To review".
  IF NEW.added_by_resident_services THEN
    RETURN NEW;
  END IF;
  FOR a IN SELECT * FROM resident_services_room_admins() LOOP
    PERFORM emit_system_task(
      'resident_services', 'review:' || NEW.id || ':' || a.id, a.id,
      'Review for Resident Services — ' || COALESCE(v_org, 'an organization'),
      a.dept, 'p3'::priority, current_date + 7,
      COALESCE(v_sender, 'Partnerships') || ' sent this organization over from the Directory. '
        || 'Open "To review" in the Resident Services room, check what we have, add the programs '
        || 'residents can use, then click "Reviewed — this is correct".'
    );
  END LOOP;
  RETURN NEW;
END $$;

-- ─── 2. Name helpers for matching ───────────────────────────────────
-- Lowercase, "&" -> "and", punctuation dropped, filler words dropped.
CREATE OR REPLACE FUNCTION org_name_norm(p text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(
           regexp_replace(
             ' ' || regexp_replace(replace(lower(coalesce(p, '')), '&', ' and '), '[^a-z0-9]+', ' ', 'g') || ' ',
             ' (the|inc|incorporated|llc|corp|co|ltd) ', ' ', 'g'),
           '\s+', ' ', 'g'));
$$;

-- The same, with the spaces taken out ("c h a n c e" -> "chance").
CREATE OR REPLACE FUNCTION org_name_compact(p text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(org_name_norm(p), ' ', '');
$$;

-- First letters of the words that matter ("Center Against Rape and Domestic Violence" -> "cardv").
CREATE OR REPLACE FUNCTION org_name_initials(p text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(string_agg(left(w, 1), '' ORDER BY i), '')
  FROM unnest(string_to_array(org_name_norm(p), ' ')) WITH ORDINALITY AS t(w, i)
  WHERE w <> '' AND w NOT IN ('and', 'of', 'for', 'a', 'an', 'in', 'on', 'at', 'to');
$$;

CREATE OR REPLACE FUNCTION org_website_domain(p text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(split_part(regexp_replace(lower(trim(coalesce(p, ''))), '^(https?://)?(www\.)?', ''), '/', 1), '');
$$;

-- ─── 3. The match check ─────────────────────────────────────────────
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

-- ─── 4. Tell the Partnerships room admin (task list + Partnerships Home) ─
CREATE OR REPLACE FUNCTION rs_tell_partnerships(p_ref text, p_title text, p_notes text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid := COALESCE(
    partnerships_room_admin_id(),
    (SELECT p.id FROM profiles p WHERE p.active AND p.role = 'admin' AND NOT p.hidden_from_lists
       AND p.department IS DISTINCT FROM 'exec' ORDER BY p.full_name LIMIT 1));
BEGIN
  IF v_admin IS NULL THEN RETURN; END IF;
  PERFORM emit_system_task('crm', p_ref, v_admin, p_title, 'partnerships'::department, 'p3'::priority, current_date, p_notes);  -- due today so it shows on Partnerships Home right away
END $$;
REVOKE EXECUTE ON FUNCTION rs_tell_partnerships(text, text, text) FROM PUBLIC;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION rs_tell_partnerships(text, text, text) FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;

-- ─── 5. "Add as a new organization" ─────────────────────────────────
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

-- ─── 6. "Use this one" ──────────────────────────────────────────────
-- p_open_review: put it in "To review" (from the room's "+ Add an organization"). From
-- inside "+ Add a program" it's false: saving the program is what connects it.
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
     AND p.type NOT IN ('volunteer', 'prayer');
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
