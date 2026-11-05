-- Resident Services "To review" inbox + room-admin routing. Agreed with Susanna 2026-11-05.
--
-- 1. Partnerships staff send a Directory record to Resident Services with one click
--    (resident_service_reviews). The Resident Services room admin reviews it: adds the
--    actual programs (created with needs_review = true, so they're not "checked", not in
--    the main list and can't be published), then clicks "Reviewed — this is correct",
--    which stamps them checked and closes the review.
-- 2. Services no longer have owners. Every Resident Services task (review + 9-month
--    re-check) goes to the room admin(s) -- profiles.sop_admin_rooms contains
--    'resident-services' -- falling back to admins when nobody is set.
-- 3. Fixes the re-check task never coming back after the first re-check (the task ref was
--    the same every cycle, and emit_system_task updates a done task in place).
-- 4. Resident Services staff can read/edit the Directory records their services link to,
--    even without Partnerships access.
-- 5. Moves the Benton County Health Department service (entered by hand 11-05, guessed at)
--    into the inbox for review.
--
-- Depends on 0199/0200. Idempotent.

-- ─── 1. Review state on services + the inbox table ───────────────────
ALTER TABLE resident_services ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS resident_service_reviews (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   uuid        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  sent_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL
);

-- One open review per organization.
CREATE UNIQUE INDEX IF NOT EXISTS resident_service_reviews_one_open
  ON resident_service_reviews(partner_id) WHERE reviewed_at IS NULL;

ALTER TABLE resident_service_reviews ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY resident_service_reviews_select ON resident_service_reviews
    FOR SELECT TO authenticated USING (resident_services_has_access() OR partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
-- Sending is a Partnerships action.
DO $$ BEGIN
  CREATE POLICY resident_service_reviews_insert ON resident_service_reviews
    FOR INSERT TO authenticated WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY resident_service_reviews_update ON resident_service_reviews
    FOR UPDATE TO authenticated USING (resident_services_has_access()) WITH CHECK (resident_services_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── 2. Who gets Resident Services tasks ─────────────────────────────
CREATE OR REPLACE FUNCTION resident_services_room_admins()
RETURNS TABLE (id uuid, dept department)
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH room AS (
    SELECT p.id, p.department FROM profiles p
    WHERE p.active AND 'resident-services' = ANY (p.sop_admin_rooms)
  )
  SELECT id, COALESCE(department, 'ops'::department) FROM room
  UNION ALL
  SELECT p.id, COALESCE(p.department, 'ops'::department) FROM profiles p
  WHERE NOT EXISTS (SELECT 1 FROM room)
    AND p.active AND p.role = 'admin' AND NOT p.hidden_from_lists
    AND p.department IS DISTINCT FROM 'exec';
$$;

REVOKE EXECUTE ON FUNCTION resident_services_room_admins() FROM PUBLIC;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION resident_services_room_admins() FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;

-- ─── 3. No per-service owners ────────────────────────────────────────
DROP TRIGGER IF EXISTS resident_services_notify_owner_handoff ON resident_services;
UPDATE resident_services SET owner_id = NULL WHERE owner_id IS NOT NULL;

-- Stamping: a service waiting for review is never "checked" and can't be published.
CREATE OR REPLACE FUNCTION resident_services_stamp() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.needs_review AND NEW.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Review this service before publishing it to the website';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.owner_id := NULL;
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    IF NEW.needs_review THEN
      NEW.last_checked_at := NULL;
      NEW.last_checked_by := NULL;
      NEW.last_checked_how := NULL;
    ELSIF NEW.last_checked_at IS NULL THEN
      NEW.last_checked_at := now();
      NEW.last_checked_by := auth.uid();
      NEW.last_checked_how := COALESCE(NEW.last_checked_how, 'edited');
    END IF;
    NEW.published_at := CASE WHEN NEW.published_at IS NOT NULL THEN now() END;
    NEW.published_by := CASE WHEN NEW.published_at IS NOT NULL THEN auth.uid() END;
    RETURN NEW;
  END IF;

  IF NOT NEW.needs_review
     AND NEW.last_checked_at IS NOT DISTINCT FROM OLD.last_checked_at
     AND auth.uid() IS NOT NULL
     AND (NEW.name, NEW.service_type, NEW.serves, NEW.address, NEW.address_confidential,
          NEW.help_phone, NEW.hours, NEW.how_to_access, NEW.website)
         IS DISTINCT FROM
         (OLD.name, OLD.service_type, OLD.serves, OLD.address, OLD.address_confidential,
          OLD.help_phone, OLD.hours, OLD.how_to_access, OLD.website)
  THEN
    NEW.last_checked_at := now();
    NEW.last_checked_by := auth.uid();
    NEW.last_checked_how := 'edited';
  END IF;

  IF NEW.published_at IS NOT NULL AND OLD.published_at IS NULL THEN
    NEW.published_at := now();
    NEW.published_by := auth.uid();
  ELSIF NEW.published_at IS NULL THEN
    NEW.published_by := NULL;
  END IF;
  RETURN NEW;
END $$;

-- ─── 4. Re-check task → room admins, once per check cycle ────────────
CREATE OR REPLACE FUNCTION emit_resident_service_recheck_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  a record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.name, s.last_checked_at, COALESCE(p.name, s.provider_name) AS provider
    FROM resident_services s
    LEFT JOIN partners p ON p.id = s.partner_id
    WHERE s.archived_at IS NULL
      AND NOT s.needs_review
      AND s.last_checked_at < now() - interval '9 months'
  LOOP
    FOR a IN SELECT * FROM resident_services_room_admins() LOOP
      -- The check date is part of the ref, so each 9-month cycle gets a fresh task.
      PERFORM emit_system_task(
        'resident_services',
        'recheck:' || r.id || ':' || to_char(r.last_checked_at, 'YYYYMMDD') || ':' || a.id,
        a.id,
        'Re-check service info — ' || r.provider || ': ' || r.name,
        a.dept, 'p3'::priority, current_date,
        'Call them or check their website, then click "Still correct" (or edit what changed) on the service in the Resident Services room.'
      );
    END LOOP;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION resolve_resident_service_recheck_task() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.last_checked_at IS DISTINCT FROM OLD.last_checked_at AND NEW.last_checked_at >= now() - interval '9 months')
     OR (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL) THEN
    UPDATE tasks SET status = 'done', updated_at = now()
     WHERE source_system = 'resident_services'
       AND source_ref LIKE 'recheck:' || NEW.id || '%'
       AND status <> 'done';
  END IF;
  RETURN NEW;
END $$;

-- ─── 5. Review tasks: open on send, close on review ──────────────────
CREATE OR REPLACE FUNCTION resident_service_review_emit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a record;
  v_org    text := (SELECT name FROM partners WHERE id = NEW.partner_id);
  v_sender text := (SELECT full_name FROM profiles WHERE id = NEW.sent_by);
BEGIN
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

DO $$ BEGIN
  CREATE TRIGGER resident_service_reviews_emit
    AFTER INSERT ON resident_service_reviews
    FOR EACH ROW EXECUTE FUNCTION resident_service_review_emit();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION resident_service_review_resolve() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.reviewed_at IS NOT NULL AND OLD.reviewed_at IS NULL THEN
    UPDATE tasks SET status = 'done', updated_at = now()
     WHERE source_system = 'resident_services'
       AND source_ref LIKE 'review:' || NEW.id || '%'
       AND status <> 'done';
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER resident_service_reviews_resolve
    AFTER UPDATE ON resident_service_reviews
    FOR EACH ROW EXECUTE FUNCTION resident_service_review_resolve();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- "Reviewed — this is correct": stamps every service waiting on this organization as
-- checked by the reviewer, and closes the review. Runs with the caller's rights (RLS applies).
CREATE OR REPLACE FUNCTION complete_resident_service_review(p_review_id uuid, p_how text)
RETURNS void
  LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_partner uuid;
BEGIN
  IF p_how NOT IN ('called', 'website', 'in_person') THEN
    RAISE EXCEPTION 'Say how you checked: called, website or in person';
  END IF;
  SELECT partner_id INTO v_partner FROM resident_service_reviews
   WHERE id = p_review_id AND reviewed_at IS NULL;
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'This review is already done or no longer exists';
  END IF;

  UPDATE resident_services
     SET needs_review = false,
         last_checked_at = now(), last_checked_by = auth.uid(), last_checked_how = p_how
   WHERE partner_id = v_partner AND needs_review AND archived_at IS NULL;

  UPDATE resident_service_reviews
     SET reviewed_at = now(), reviewed_by = auth.uid()
   WHERE id = p_review_id;
END $$;

REVOKE EXECUTE ON FUNCTION complete_resident_service_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_resident_service_review(uuid, text) TO authenticated;

-- ─── 6. Website never shows a service waiting for review ─────────────
CREATE OR REPLACE FUNCTION get_public_resources()
RETURNS TABLE (
  id uuid, provider text, service text, service_type text, serves text[],
  address text, help_phone text, hours text, how_to_access text, website text,
  last_checked_at timestamptz
)
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT s.id,
         COALESCE(p.name, s.provider_name),
         s.name, s.service_type, s.serves,
         CASE WHEN s.address_confidential THEN NULL ELSE s.address END,
         s.help_phone, s.hours, s.how_to_access,
         COALESCE(s.website, p.website),
         s.last_checked_at
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

-- ─── 7. Resident Services staff see the Directory records they work with ─
-- Only organizations with a service or a review, so the rest of the Directory (donors etc.)
-- stays Partnerships-only. MOU changes are still blocked by partners_info_stamp_and_guard.
CREATE OR REPLACE FUNCTION partner_in_resident_services(p_partner_id uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM resident_services WHERE partner_id = p_partner_id)
      OR EXISTS (SELECT 1 FROM resident_service_reviews WHERE partner_id = p_partner_id);
$$;

DO $$ BEGIN
  CREATE POLICY partners_select_resident_services ON partners
    FOR SELECT TO authenticated
    USING (resident_services_has_access() AND partner_in_resident_services(id));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY partners_update_resident_services ON partners
    FOR UPDATE TO authenticated
    USING (resident_services_has_access() AND partner_in_resident_services(id))
    WITH CHECK (resident_services_has_access() AND partner_in_resident_services(id));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY partner_contacts_resident_services ON partner_contacts
    FOR ALL TO authenticated
    USING (resident_services_has_access() AND partner_in_resident_services(partner_id))
    WITH CHECK (resident_services_has_access() AND partner_in_resident_services(partner_id));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── 8. Benton County Health Department → the inbox ──────────────────
-- Only if it has never been through review (so a re-run after Audrey reviews is a no-op).
DO $$
DECLARE
  v_partner uuid;
  v_sender  uuid;
BEGIN
  SELECT s.partner_id, s.created_by INTO v_partner, v_sender
  FROM resident_services s
  JOIN partners p ON p.id = s.partner_id
  WHERE p.name = 'Benton County Health Department' AND s.archived_at IS NULL
  ORDER BY s.created_at
  LIMIT 1;

  IF v_partner IS NULL
     OR EXISTS (SELECT 1 FROM resident_service_reviews WHERE partner_id = v_partner) THEN
    RETURN;
  END IF;

  UPDATE resident_services
     SET needs_review = true, published_at = NULL,
         last_checked_at = NULL, last_checked_by = NULL, last_checked_how = NULL
   WHERE partner_id = v_partner AND archived_at IS NULL;

  INSERT INTO resident_service_reviews (partner_id, sent_by) VALUES (v_partner, v_sender);
END $$;
