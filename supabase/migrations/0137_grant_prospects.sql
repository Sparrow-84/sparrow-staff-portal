-- 0137_grant_prospects.sql
-- Grant Prospects pipeline (Operations room, Grants module) — leads before they're real
-- grants: not researched -> researching -> decided to pursue/no -> applied -> awarded.
-- Awarding a prospect creates a real row in `grants` (see mark_prospect_awarded below);
-- the prospect record itself stays as permanent research history, it doesn't get deleted.
--
-- Also splits the Grants module into Active vs Past via a new `grants.status` column,
-- so a wrapped-up grant keeps every field/link/document intact, just flagged done.

-- ─── Active vs Past on existing grants (additive only — no existing data touched) ────
ALTER TABLE grants ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
DO $$ BEGIN
  ALTER TABLE grants ADD CONSTRAINT grants_status_check CHECK (status IN ('active', 'past'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Reusable Tier / Source labels (shared across ops tier, not personal like task labels —
-- everyone with Grants access should see the same label set, same reasoning as calendar labels) ──
DO $$ BEGIN
  CREATE TYPE grant_prospect_label_kind AS ENUM ('tier', 'source');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS grant_prospect_labels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       grant_prospect_label_kind NOT NULL,
  name       text        NOT NULL,
  color      text        NOT NULL,
  created_by uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE grant_prospect_labels ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY grant_prospect_labels_all ON grant_prospect_labels FOR ALL TO authenticated
    USING (has_ops_access()) WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Prospects (one row per lead) ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE grant_prospect_status AS ENUM (
    'not_researched', 'researching', 'decided_pursue', 'decided_no', 'applied', 'awarded'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS grant_prospects (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  tier_label_id       uuid        REFERENCES grant_prospect_labels(id) ON DELETE SET NULL,
  source_label_id     uuid        REFERENCES grant_prospect_labels(id) ON DELETE SET NULL,
  status              grant_prospect_status NOT NULL DEFAULT 'not_researched',
  application_opens   date,
  application_deadline date,
  est_amount          numeric(12,2),
  findings            text,
  decision_reasoning  text,
  action_steps        text,
  converted_grant_id  uuid        REFERENCES grants(id) ON DELETE SET NULL,
  created_by          uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TRIGGER set_grant_prospects_updated_at
    BEFORE UPDATE ON grant_prospects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE grant_prospects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY grant_prospects_all ON grant_prospects FOR ALL TO authenticated
    USING (has_ops_access()) WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Links (multiple per prospect — guidelines page, application portal, etc.) ──────
CREATE TABLE IF NOT EXISTS grant_prospect_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid        NOT NULL REFERENCES grant_prospects(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  url         text        NOT NULL,
  created_by  uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_prospect_links_prospect_idx ON grant_prospect_links(prospect_id);

ALTER TABLE grant_prospect_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY grant_prospect_links_all ON grant_prospect_links FOR ALL TO authenticated
    USING (has_ops_access()) WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Documents (same shape as grant_documents, including a summary from day one — see
-- 0136 for why the summary field matters here too) — reuses the existing private
-- 'grant-documents' Storage bucket (its policies only check bucket_id, not path, so
-- prospect uploads work under the same policies without any new bucket/policy needed) ──
CREATE TABLE IF NOT EXISTS grant_prospect_documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id  uuid        NOT NULL REFERENCES grant_prospects(id) ON DELETE CASCADE,
  label        text        NOT NULL,
  storage_path text        NOT NULL,
  summary      text,
  created_by   uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_prospect_documents_prospect_idx ON grant_prospect_documents(prospect_id);

ALTER TABLE grant_prospect_documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY grant_prospect_documents_all ON grant_prospect_documents FOR ALL TO authenticated
    USING (has_ops_access()) WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Award a prospect: creates the real Active Grant record and closes the prospect out.
-- Pre-fills what's already known; findings/reasoning fold into the new grant's notes so
-- the research trail isn't lost even though it now lives on a different row. ──────────
CREATE OR REPLACE FUNCTION mark_prospect_awarded(p_prospect_id uuid, p_created_by uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prospect grant_prospects;
  v_grant_id uuid;
  v_notes text;
BEGIN
  IF NOT has_ops_access() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_prospect FROM grant_prospects WHERE id = p_prospect_id;
  IF v_prospect IS NULL THEN
    RAISE EXCEPTION 'Prospect not found';
  END IF;

  v_notes := 'Converted from a Grants prospect on ' || to_char(now(), 'YYYY-MM-DD') || '.';
  IF v_prospect.findings IS NOT NULL THEN
    v_notes := v_notes || E'\n\nFindings: ' || v_prospect.findings;
  END IF;
  IF v_prospect.decision_reasoning IS NOT NULL THEN
    v_notes := v_notes || E'\n\nWhy pursued: ' || v_prospect.decision_reasoning;
  END IF;

  INSERT INTO grants (funder_name, amount, notes, created_by, status)
  VALUES (v_prospect.name, v_prospect.est_amount, v_notes, p_created_by, 'active')
  RETURNING id INTO v_grant_id;

  UPDATE grant_prospects
  SET status = 'awarded', converted_grant_id = v_grant_id
  WHERE id = p_prospect_id;

  RETURN v_grant_id;
END;
$$;
