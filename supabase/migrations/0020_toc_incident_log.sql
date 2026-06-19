-- 0020_toc_incident_log.sql
-- Incident log for Twin Oaks. TOC staff and admins can view. Any authenticated
-- staff can log an incident (as themselves). Staff can edit their own; admins edit any.
-- Deletes are admin-only.

CREATE TABLE IF NOT EXISTS toc_incidents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_date timestamptz NOT NULL,
  lot_id        uuid REFERENCES spaces(id) ON DELETE SET NULL,
  lot_label     text,
  incident_type text NOT NULL,
  severity      text NOT NULL DEFAULT 'low',
  description   text NOT NULL,
  logged_by     uuid NOT NULL REFERENCES profiles(id),
  follow_up     text,
  status        text NOT NULL DEFAULT 'open',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE toc_incidents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY incidents_read ON toc_incidents FOR SELECT TO authenticated
    USING (can_see_residents());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY incidents_insert ON toc_incidents FOR INSERT TO authenticated
    WITH CHECK (logged_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY incidents_update ON toc_incidents FOR UPDATE TO authenticated
    USING (logged_by = auth.uid() OR is_admin())
    WITH CHECK (logged_by = auth.uid() OR is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY incidents_delete ON toc_incidents FOR DELETE TO authenticated
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
