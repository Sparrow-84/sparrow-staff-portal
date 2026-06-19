-- 0019_org_documents.sql
-- Org-wide reference document library visible to all staff.
-- Ops tier (Andrew, Susanna, Shelly) can add / edit / delete.
-- All authenticated staff can read.

CREATE TABLE IF NOT EXISTS org_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  category    text NOT NULL DEFAULT 'General',
  description text,
  url         text,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE org_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY org_docs_read ON org_documents FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY org_docs_write ON org_documents FOR ALL TO authenticated
    USING (has_ops_access())
    WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
