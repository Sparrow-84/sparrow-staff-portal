-- Sparrow — LCP: outcome check-ins (stably-housed tracking over time) +
-- optional household phone, to unblock backfilling historical participants.
--
-- Context: reconciling the old outcomes report against the live system found
-- that a single "stably housed?" flag can't represent reality -- Gracie was
-- housed the day she left the program, then homeless again months later. A
-- single column can only ever hold one value, so this instead adds a small
-- history table: one row per assessment, not per family. families.stably_housed
-- becomes a cached mirror of the MOST RECENT check-in, auto-kept in sync by a
-- trigger (same "auto-stamp, don't hand-edit" convention as program_end_date
-- in 0087) -- so anything reading the simple current-status number (the
-- future metrics hub, Bethany's stats) can just read one column, while the
-- full history stays available on the family record.
--
-- Also makes lcp_household_adults.phone optional. Note: adult .email was
-- already dropped entirely in 0096 (the adult's email IS families.login_email)
-- -- so phone is the only contact field left to loosen. Done specifically so
-- the historical/pre-system families (no contact info on file at all) can be
-- entered without fake data. Susanna's explicit call, logged as a temporary
-- loosening, not a permanent one -- see wasp-nest item 3a: re-lock to
-- required once Shelly/Audrey backfill real contact info for families that
-- have it.
--
-- Depends on: 0005_lcp.sql (families, lcp_has_access), 0087 (program_end_date),
-- 0096 (adult email already dropped).
-- Safe to re-run: tables/columns use IF NOT EXISTS; ALTER COLUMN DROP NOT NULL
-- is naturally idempotent; the milestone seed only inserts into an empty table.

-- ─── Household contact info: phone becomes optional ───────────────────────
ALTER TABLE lcp_household_adults ALTER COLUMN phone DROP NOT NULL;

-- ─── families: cached "current" outcome, mirrors latest check-in ─────────
ALTER TABLE families ADD COLUMN IF NOT EXISTS stably_housed boolean;

-- ─── Outcome check-ins: one row per assessment ────────────────────────────
CREATE TABLE IF NOT EXISTS lcp_outcome_checkins (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  checkin_date   date,                              -- nullable: exact date often unknown for historical entries
  label          text        NOT NULL DEFAULT 'Check-in',  -- e.g. "Exit", "6-month follow-up" -- free text, no locked list
  stably_housed  boolean     NOT NULL,               -- the only thing the success % ever reads
  notes          text,                               -- the journey-summary / reason text
  logged_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  -- clock_timestamp(), not now(): the sync trigger below breaks ties on
  -- created_at when checkin_date is null (common for historical backfills
  -- with no real date on file) -- now() returns the same transaction-start
  -- value for every row in a multi-row INSERT, which would tie two check-ins
  -- inserted together and make "which one is latest" undefined. clock_
  -- timestamp() is evaluated per row, so insertion order is preserved.
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS lcp_outcome_checkins_family_idx ON lcp_outcome_checkins(family_id);

ALTER TABLE lcp_outcome_checkins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lcp_staff_outcome_checkins_all"
    ON lcp_outcome_checkins FOR ALL
    TO authenticated
    USING (lcp_has_access())
    WITH CHECK (lcp_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Keep families.stably_housed synced to the latest check-in ───────────
CREATE OR REPLACE FUNCTION sync_family_stably_housed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_family_id uuid := COALESCE(NEW.family_id, OLD.family_id);
  latest boolean;
BEGIN
  SELECT stably_housed INTO latest
  FROM lcp_outcome_checkins
  WHERE family_id = target_family_id
  ORDER BY checkin_date DESC NULLS LAST, created_at DESC
  LIMIT 1;

  UPDATE families SET stably_housed = latest WHERE id = target_family_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER lcp_outcome_checkins_sync_family
    AFTER INSERT OR UPDATE OR DELETE ON lcp_outcome_checkins
    FOR EACH ROW EXECUTE FUNCTION sync_family_stably_housed();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Check-in milestones: editable policy config, not hardcoded ──────────
-- How often/when a past participant should be checked on isn't a settled
-- program policy yet (Susanna's own words: "I don't know how much or when is
-- reasonable") -- so this is a small table staff can adjust later (via
-- Shelly's eventual answer, tracked on tiger-den) without needing a new
-- migration, rather than baking specific months into code.
CREATE TABLE IF NOT EXISTS lcp_checkin_milestones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label             text NOT NULL,
  months_after_exit int  NOT NULL,
  sort_order        int  NOT NULL DEFAULT 0
);

ALTER TABLE lcp_checkin_milestones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lcp_staff_checkin_milestones_all"
    ON lcp_checkin_milestones FOR ALL
    TO authenticated
    USING (lcp_has_access())
    WITH CHECK (lcp_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Seed only if the table is completely empty, so a future manual edit/delete
-- by staff (once real policy is decided) is never silently re-added by a
-- re-run of this migration.
INSERT INTO lcp_checkin_milestones (label, months_after_exit, sort_order)
SELECT * FROM (VALUES
  ('6-month follow-up', 6, 1),
  ('1-year follow-up', 12, 2),
  ('5-year follow-up', 60, 3)
) AS v(label, months_after_exit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM lcp_checkin_milestones);
