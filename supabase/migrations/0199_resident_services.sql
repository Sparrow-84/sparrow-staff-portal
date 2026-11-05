-- Resident Services room + the Partnerships Directory links that go with it.
-- Design agreed with Susanna 2026-11-04 (mockup: claude.ai/artifact/Mr5hn6De9KaS73oFtUkjRD).
--
-- The Directory (partners) holds RELATIONSHIPS: one record per organization. The new
-- resident_services table holds SERVICES: what a resident can actually get from that
-- organization (who qualifies, where to go, the number to call, hours). A service links to
-- its organization's Directory record; programs with no local organization (e.g. a
-- scholarship) use provider_name instead. Nothing about an organization is stored twice.
--
-- Depends on 0198 (adds the 'handoff' notification_type value used below).
-- Safe to re-run: IF NOT EXISTS / CREATE OR REPLACE / duplicate_object guards throughout.

-- ─── 1. Room access flag ─────────────────────────────────────────────
-- There is no Resident Services department (department enum is toc/lcp/partnerships/ops/
-- exec), so the room uses its own access flag, like partnerships_access / stories_access.
-- Partnerships staff can always see services (they use them for presentations).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resident_services_access boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION resident_services_has_access() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    current_user NOT IN ('anon', 'authenticated')   -- trusted service context (pg_cron)
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR resident_services_access OR department = 'partnerships' OR partnerships_access)
    );
$$;

-- "Partnerships staff" (not just anyone with Partnerships room access): the people who may
-- change an MOU. Resident Services staff have room access but not this.
CREATE OR REPLACE FUNCTION is_partnerships_staff() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (role = 'admin' OR department = 'partnerships')
  );
$$;

-- Admin-only guard: same list as 0191, plus the new flag.
CREATE OR REPLACE FUNCTION guard_profile_access_columns() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role                     IS DISTINCT FROM OLD.role
  OR NEW.department               IS DISTINCT FROM OLD.department
  OR NEW.manager_email            IS DISTINCT FROM OLD.manager_email
  OR NEW.active                   IS DISTINCT FROM OLD.active
  OR NEW.email                    IS DISTINCT FROM OLD.email
  OR NEW.lcp_role                 IS DISTINCT FROM OLD.lcp_role
  OR NEW.lcp_curriculum_access    IS DISTINCT FROM OLD.lcp_curriculum_access
  OR NEW.partnerships_access      IS DISTINCT FROM OLD.partnerships_access
  OR NEW.ops_access               IS DISTINCT FROM OLD.ops_access
  OR NEW.toc_access               IS DISTINCT FROM OLD.toc_access
  OR NEW.stories_access           IS DISTINCT FROM OLD.stories_access
  OR NEW.hidden_from_lists        IS DISTINCT FROM OLD.hidden_from_lists
  OR NEW.resident_services_access IS DISTINCT FROM OLD.resident_services_access
  THEN
    RAISE EXCEPTION 'Only admins can change role, department, or access settings';
  END IF;

  RETURN NEW;
END $$;

-- Grant the room to everyone who already has Partnerships room access (today: Partnerships
-- staff + Resident Services staff). Admins can adjust per person afterwards.
UPDATE profiles SET resident_services_access = true
WHERE (department = 'partnerships' OR partnerships_access) AND NOT resident_services_access;

-- ─── 2. Services table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resident_services (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id           uuid        REFERENCES partners(id) ON DELETE SET NULL,
  provider_name        text,        -- only when there's no Directory record (e.g. a scholarship)
  name                 text        NOT NULL,
  service_type         text        NOT NULL,
  serves               text[]      NOT NULL DEFAULT '{}',
  -- Public-facing: what someone seeking help needs. These can go on the website.
  address              text,
  address_confidential boolean     NOT NULL DEFAULT false,  -- e.g. a DV shelter: never publish
  help_phone           text,
  hours                text,
  how_to_access        text,
  website              text,
  -- Internal only, never published.
  internal_notes       text,
  owner_id             uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by           uuid        REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  last_checked_at      timestamptz,
  last_checked_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  last_checked_how     text        CHECK (last_checked_how IN ('called', 'website', 'in_person', 'edited')),
  -- Publishing is never a default: only set by someone clicking "Publish to website".
  published_at         timestamptz,
  published_by         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  archived_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_services_has_provider CHECK (partner_id IS NOT NULL OR nullif(trim(provider_name), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS resident_services_partner_idx ON resident_services(partner_id);

DO $$ BEGIN
  CREATE TRIGGER resident_services_set_updated_at
    BEFORE UPDATE ON resident_services
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE resident_services ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY resident_services_all ON resident_services
    FOR ALL TO authenticated
    USING (resident_services_has_access())
    WITH CHECK (resident_services_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Owner defaults to whoever added it; "last checked" starts at creation. Any edit to what
-- people see restamps it as checked by the editor. Publishing is stamped server-side.
CREATE OR REPLACE FUNCTION resident_services_stamp() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.owner_id := COALESCE(NEW.owner_id, auth.uid());
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    IF NEW.last_checked_at IS NULL THEN
      NEW.last_checked_at := now();
      NEW.last_checked_by := auth.uid();
      NEW.last_checked_how := COALESCE(NEW.last_checked_how, 'edited');
    END IF;
    NEW.published_at := CASE WHEN NEW.published_at IS NOT NULL THEN now() END;
    NEW.published_by := CASE WHEN NEW.published_at IS NOT NULL THEN auth.uid() END;
    RETURN NEW;
  END IF;

  IF NEW.last_checked_at IS NOT DISTINCT FROM OLD.last_checked_at
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

DO $$ BEGIN
  CREATE TRIGGER resident_services_stamp_trg
    BEFORE INSERT OR UPDATE ON resident_services
    FOR EACH ROW EXECUTE FUNCTION resident_services_stamp();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── 3. "Last checked" on a Directory record's contact info ──────────
ALTER TABLE partners ADD COLUMN IF NOT EXISTS info_checked_at  timestamptz;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS info_checked_by  uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS info_checked_how text
  CHECK (info_checked_how IN ('called', 'website', 'in_person', 'edited'));

-- Restamp when a person edits contact info. Skipped for system writes (auth.uid() null,
-- e.g. the Givebutter sync), which aren't anyone actually checking the details.
-- Also: only Partnerships staff may change MOU status (Resident Services staff see it).
CREATE OR REPLACE FUNCTION partners_info_stamp_and_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.mou_status IS DISTINCT FROM OLD.mou_status AND NOT is_partnerships_staff() THEN
    RAISE EXCEPTION 'Only Partnerships staff can change MOU status';
  END IF;

  IF NEW.info_checked_at IS NOT DISTINCT FROM OLD.info_checked_at
     AND (NEW.contact_name, NEW.role, NEW.phone, NEW.email, NEW.website, NEW.address)
         IS DISTINCT FROM
         (OLD.contact_name, OLD.role, OLD.phone, OLD.email, OLD.website, OLD.address)
  THEN
    NEW.info_checked_at := now();
    NEW.info_checked_by := auth.uid();
    NEW.info_checked_how := 'edited';
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER partners_info_stamp_and_guard_trg
    BEFORE UPDATE ON partners
    FOR EACH ROW EXECUTE FUNCTION partners_info_stamp_and_guard();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── 4. Owner handoff notifications (Directory + services) ───────────
CREATE OR REPLACE FUNCTION notify_owner_handoff() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entity text := CASE TG_TABLE_NAME WHEN 'partners' THEN 'partner' ELSE 'resident_service' END;
  v_body   text;
BEGIN
  IF NEW.owner_id IS NULL OR NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id
     OR NEW.owner_id IS NOT DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'partners' THEN
    v_body := NEW.name;
  ELSE
    v_body := COALESCE((SELECT p.name FROM partners p WHERE p.id = NEW.partner_id), NEW.provider_name)
              || ': ' || NEW.name;
  END IF;
  INSERT INTO notifications (user_id, actor_id, type, entity, entity_id, body)
  VALUES (NEW.owner_id, auth.uid(), 'handoff', v_entity, NEW.id, v_body);
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER partners_notify_owner_handoff
    AFTER UPDATE OF owner_id ON partners
    FOR EACH ROW EXECUTE FUNCTION notify_owner_handoff();
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TRIGGER resident_services_notify_owner_handoff
    AFTER UPDATE OF owner_id ON resident_services
    FOR EACH ROW EXECUTE FUNCTION notify_owner_handoff();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── 5. Touchpoint notes: everyone reads all, each person edits/deletes only their own ─
-- (Older notes with no logger recorded stay editable by anyone with access.) Merging
-- partners still works: merge_partners() is SECURITY DEFINER and bypasses this.
DROP POLICY IF EXISTS touchpoints_write ON partner_touchpoints;
DROP POLICY IF EXISTS touchpoints_insert ON partner_touchpoints;
DROP POLICY IF EXISTS touchpoints_update_own ON partner_touchpoints;
DROP POLICY IF EXISTS touchpoints_delete_own ON partner_touchpoints;
CREATE POLICY touchpoints_insert ON partner_touchpoints FOR INSERT TO authenticated
  WITH CHECK (
    partnerships_has_access()
    OR EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_id AND p.owner_id = auth.uid())
  );
CREATE POLICY touchpoints_update_own ON partner_touchpoints FOR UPDATE TO authenticated
  USING (
    (logged_by = auth.uid() OR logged_by IS NULL OR is_admin())
    AND (partnerships_has_access()
         OR EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()))
  )
  WITH CHECK (
    partnerships_has_access()
    OR EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_id AND p.owner_id = auth.uid())
  );
CREATE POLICY touchpoints_delete_own ON partner_touchpoints FOR DELETE TO authenticated
  USING (
    (logged_by = auth.uid() OR logged_by IS NULL OR is_admin())
    AND (partnerships_has_access()
         OR EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_id AND p.owner_id = auth.uid()))
  );

-- ─── 6. Re-check reminder: a task for the owner once a service hits 9 months ─
CREATE OR REPLACE FUNCTION emit_resident_service_recheck_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.name, s.owner_id, COALESCE(p.name, s.provider_name) AS provider,
           COALESCE(pr.department, 'toc'::department) AS dept
    FROM resident_services s
    LEFT JOIN partners p ON p.id = s.partner_id
    LEFT JOIN profiles pr ON pr.id = s.owner_id
    WHERE s.archived_at IS NULL
      AND s.owner_id IS NOT NULL
      AND s.last_checked_at < now() - interval '9 months'
  LOOP
    PERFORM emit_system_task(
      'resident_services', 'recheck:' || r.id, r.owner_id,
      'Re-check service info — ' || r.provider || ': ' || r.name,
      r.dept, 'p3'::priority, current_date,
      'Call them or check their website, then click "Still correct" (or edit what changed) on the service in the Resident Services room.'
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION emit_resident_service_recheck_tasks() FROM PUBLIC;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION emit_resident_service_recheck_tasks() FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;

-- Close the task as soon as the service is checked (or edited), or archived.
CREATE OR REPLACE FUNCTION resolve_resident_service_recheck_task() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.last_checked_at IS DISTINCT FROM OLD.last_checked_at AND NEW.last_checked_at >= now() - interval '9 months')
     OR (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL) THEN
    PERFORM resolve_system_task('resident_services', 'recheck:' || NEW.id);
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER resident_services_resolve_recheck
    AFTER UPDATE ON resident_services
    FOR EACH ROW EXECUTE FUNCTION resolve_resident_service_recheck_task();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Daily at 13:00 UTC (~6am Pacific), same slot as the other reminder jobs.
DO $$ BEGIN
  PERFORM cron.schedule(
    'resident-service-recheck-daily',
    '0 13 * * *',
    'SELECT emit_resident_service_recheck_tasks();'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ─── 7. Public list for the website's "Resources in Our Area" page ───
-- The ONLY thing the public (anon) can read. Returns just the public-facing fields of
-- services someone deliberately published, that aren't archived, and that were checked
-- within the last 2 years. A confidential address is never returned. Internal notes,
-- contact people, owners, MOUs and touchpoints are never exposed.
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
    AND s.last_checked_at >= now() - interval '2 years'
  ORDER BY s.service_type, COALESCE(p.name, s.provider_name), s.name;
$$;

REVOKE EXECUTE ON FUNCTION get_public_resources() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_resources() TO anon, authenticated;
