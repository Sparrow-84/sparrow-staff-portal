-- 0189_room_sops.sql
-- SOPs per room. Every SOP is a link entry (title, description, Google Drive URL)
-- with exactly ONE home:
--   • home_room IS NULL  → the Resource Library (existing org_documents rows; ops tier edits, unchanged)
--   • home_room = '<room>' → that room (its room admins + admins edit)
-- Any SOP can also be LINKED into other rooms via org_document_room_links. A link
-- points at the original row (not a copy), so editing it once updates every room.
--
-- "Room admin (SOPs)" is a new per-room designation stored on profiles.sop_admin_rooms,
-- separate from Role (admin/manager/staff). For now it only grants SOP editing.
--
-- Room keys match the app's room view names: twin-oaks, lcp, partnerships, operations, stories.
-- Idempotent: safe to run more than once.

-- ─── Columns ─────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sop_admin_rooms text[] NOT NULL DEFAULT '{}';

-- profiles_update_self lets staff edit their own row, so guard this column:
-- only admins (or SQL run outside the app, where auth.uid() is null) may change it.
CREATE OR REPLACE FUNCTION guard_sop_admin_rooms() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sop_admin_rooms IS DISTINCT FROM OLD.sop_admin_rooms
     AND auth.uid() IS NOT NULL
     AND NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can change Room admin (SOPs) assignments';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_sop_admin_rooms ON profiles;
CREATE TRIGGER profiles_guard_sop_admin_rooms BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_sop_admin_rooms();

ALTER TABLE org_documents ADD COLUMN IF NOT EXISTS home_room text;

DO $$ BEGIN
  ALTER TABLE org_documents ADD CONSTRAINT org_documents_home_room_chk
    CHECK (home_room IS NULL OR home_room IN ('twin-oaks', 'lcp', 'partnerships', 'operations', 'stories'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS org_documents_home_room_idx ON org_documents (home_room);

-- ─── Links: show one SOP in additional rooms ─────────────────────────
CREATE TABLE IF NOT EXISTS org_document_room_links (
  document_id uuid NOT NULL REFERENCES org_documents (id) ON DELETE CASCADE,
  room        text NOT NULL CHECK (room IN ('twin-oaks', 'lcp', 'partnerships', 'operations', 'stories')),
  created_by  uuid REFERENCES profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, room)
);

CREATE INDEX IF NOT EXISTS org_document_room_links_room_idx ON org_document_room_links (room);

-- ─── Permission helpers ──────────────────────────────────────────────
-- Mirrors the app's room-access rules (AppShell.tsx).
CREATE OR REPLACE FUNCTION has_room_access(p_room text) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND (
        role = 'admin'
        OR (p_room = 'twin-oaks'    AND (department = 'toc' OR toc_access))
        OR (p_room = 'lcp'          AND lcp_role IN ('full', 'extended'))
        OR (p_room = 'partnerships' AND (department = 'partnerships' OR partnerships_access))
        OR (p_room = 'operations'   AND ops_access)
        OR (p_room = 'stories'      AND stories_access)
      )
  );
$$;

-- Admins, or anyone designated Room admin (SOPs) for this room.
CREATE OR REPLACE FUNCTION is_room_sop_admin(p_room text) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR p_room = ANY (sop_admin_rooms))
  );
$$;

-- Can the current user see this document? Library docs: everyone. Room SOPs: anyone
-- with access to the home room or to any room it's linked into.
CREATE OR REPLACE FUNCTION can_read_org_document(p_doc uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_documents d
    WHERE d.id = p_doc
      AND (
        d.home_room IS NULL
        OR has_room_access(d.home_room)
        OR EXISTS (
          SELECT 1 FROM org_document_room_links l
          WHERE l.document_id = d.id AND has_room_access(l.room)
        )
      )
  );
$$;

-- ─── RLS: org_documents ──────────────────────────────────────────────
-- Replace the old read-all / ops-write policies with home-aware ones.
-- Library docs (home_room IS NULL) keep exactly the old rules.
DROP POLICY IF EXISTS org_docs_read  ON org_documents;
DROP POLICY IF EXISTS org_docs_write ON org_documents;
DROP POLICY IF EXISTS org_docs_insert ON org_documents;
DROP POLICY IF EXISTS org_docs_update ON org_documents;
DROP POLICY IF EXISTS org_docs_delete ON org_documents;

CREATE POLICY org_docs_read ON org_documents FOR SELECT TO authenticated
  USING (can_read_org_document(id));

CREATE POLICY org_docs_insert ON org_documents FOR INSERT TO authenticated
  WITH CHECK (
    (home_room IS NULL AND has_ops_access())
    OR (home_room IS NOT NULL AND is_room_sop_admin(home_room))
  );

-- WITH CHECK also stops a room admin from moving a SOP into a room they don't run.
CREATE POLICY org_docs_update ON org_documents FOR UPDATE TO authenticated
  USING (
    (home_room IS NULL AND has_ops_access())
    OR (home_room IS NOT NULL AND is_room_sop_admin(home_room))
  )
  WITH CHECK (
    (home_room IS NULL AND has_ops_access())
    OR (home_room IS NOT NULL AND is_room_sop_admin(home_room))
  );

CREATE POLICY org_docs_delete ON org_documents FOR DELETE TO authenticated
  USING (
    (home_room IS NULL AND has_ops_access())
    OR (home_room IS NOT NULL AND is_room_sop_admin(home_room))
  );

-- ─── RLS: links ──────────────────────────────────────────────────────
ALTER TABLE org_document_room_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_doc_links_read   ON org_document_room_links;
DROP POLICY IF EXISTS org_doc_links_insert ON org_document_room_links;
DROP POLICY IF EXISTS org_doc_links_delete ON org_document_room_links;

-- See a link if you can see the room it's in, or you edit the doc it points at
-- (so the doc's owner can see where else it's shown before removing it).
CREATE POLICY org_doc_links_read ON org_document_room_links FOR SELECT TO authenticated
  USING (has_room_access(room) OR can_read_org_document(document_id));

-- The TARGET room's room admins decide what's linked into their room, and can only
-- link docs they can already see.
CREATE POLICY org_doc_links_insert ON org_document_room_links FOR INSERT TO authenticated
  WITH CHECK (is_room_sop_admin(room) AND can_read_org_document(document_id));

CREATE POLICY org_doc_links_delete ON org_document_room_links FOR DELETE TO authenticated
  USING (is_room_sop_admin(room));
