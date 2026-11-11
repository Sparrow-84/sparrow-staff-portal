-- Grant/Prospect Updates: an append-only timeline so a current-state field (Findings,
-- Decision Reasoning, Action Steps) can be edited forward without losing the history of
-- what actually happened and when. Two structured milestone dates (applied_date,
-- outcome_date) live on grant_prospects itself so they're always visible/sortable in the
-- quick-view table, never buried in a scrollable log — everything else (calls, context,
-- minor back-and-forth) goes in the Updates log below, tagged with an optional milestone
-- label so key entries still stand out visually from routine ones.

ALTER TABLE grant_prospects ADD COLUMN IF NOT EXISTS applied_date date;
ALTER TABLE grant_prospects ADD COLUMN IF NOT EXISTS outcome_date date;

-- ─── Prospect Updates ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grant_prospect_updates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid        NOT NULL REFERENCES grant_prospects(id) ON DELETE CASCADE,
  body        text        NOT NULL,
  milestone   text,
  created_by  uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_prospect_updates_prospect_idx ON grant_prospect_updates(prospect_id);

ALTER TABLE grant_prospect_updates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY grant_prospect_updates_all ON grant_prospect_updates FOR ALL TO authenticated
    USING (has_ops_access()) WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Grant Updates (same shape, for the Active Grant side — a Prospect's Updates log
-- is carried forward here when it's awarded, see mark_prospect_awarded() below, so the
-- history survives the conversion instead of being stranded on a record the UI no longer
-- surfaces once status flips to 'awarded') ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grant_updates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id    uuid        NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  body        text        NOT NULL,
  milestone   text,
  created_by  uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_updates_grant_idx ON grant_updates(grant_id);

ALTER TABLE grant_updates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY grant_updates_all ON grant_updates FOR ALL TO authenticated
    USING (has_ops_access()) WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Redefine mark_prospect_awarded() to also set outcome_date, carry the prospect's
-- Updates log onto the new grant, and append one final milestone entry noting the
-- conversion — everything else identical to 0145's version. ────────────────────────
-- p_outcome_date/p_note let the caller backdate the award to when it actually happened
-- (a letter dated a few days before it's logged, say) rather than always stamping
-- "today" — and give the auto-generated Updates entry real content instead of a
-- generic line.
CREATE OR REPLACE FUNCTION mark_prospect_awarded(
  p_prospect_id uuid,
  p_created_by uuid,
  p_outcome_date date DEFAULT current_date,
  p_note text DEFAULT NULL
)
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

  INSERT INTO grants (funder_name, amount, notes, created_by, status, owner_id)
  VALUES (v_prospect.name, v_prospect.est_amount, v_notes, p_created_by, 'active', v_prospect.owner_id)
  RETURNING id INTO v_grant_id;

  INSERT INTO grant_links (grant_id, label, url, created_by)
  SELECT v_grant_id, label, url, created_by FROM grant_prospect_links WHERE prospect_id = p_prospect_id;

  INSERT INTO grant_updates (grant_id, body, milestone, created_by, created_at)
  SELECT v_grant_id, body, milestone, created_by, created_at FROM grant_prospect_updates WHERE prospect_id = p_prospect_id;

  INSERT INTO grant_updates (grant_id, body, milestone, created_by)
  VALUES (v_grant_id, coalesce(p_note, 'Awarded — converted from a Grants prospect.'), 'Awarded', p_created_by);

  UPDATE grant_prospects
  SET status = 'awarded', converted_grant_id = v_grant_id, outcome_date = p_outcome_date
  WHERE id = p_prospect_id;

  RETURN v_grant_id;
END;
$$;
