-- Sparrow — LCP: Program Fee tracking + household intake info (Shelly/Audrey)
-- Digitizes the paper program-fee log, plus general intake info Shelly collects
-- when she adds a family: household adults, emergency contact, program timeline.
-- Depends on: 0005_lcp.sql (families, profiles, lcp_has_access), 0002_twin_oaks.sql (spaces)
-- Safe to re-run: tables/columns use IF NOT EXISTS/guards; types use DO/EXCEPTION.

-- ─── Families: intake + program-timeline fields ───────────────────────────────
-- Onboarding start = families.created_at (the day Shelly first adds the family —
-- already exists, nothing new needed). Move-in date is staff-entered by hand
-- (they know the real date; it can't be inferred from any UI action). Program
-- end date is the one that's auto-stamped — see trigger below.

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS toc_space_id uuid REFERENCES spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS move_in_date date,
  ADD COLUMN IF NOT EXISTS program_end_date date,
  ADD COLUMN IF NOT EXISTS emergency_contact_notes text,
  ADD COLUMN IF NOT EXISTS toc_synced_at timestamptz;

-- ─── Auto-stamp program end date ───────────────────────────────────────────────
-- Staff never type this directly. It's set the moment a family either graduates
-- or leaves early ("cancel participation" — active flips to false without ever
-- graduating), so it always reflects a real action taken, not manual entry.

CREATE OR REPLACE FUNCTION stamp_lcp_program_end_date()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.program_end_date IS NULL THEN
    IF NEW.status = 'graduated' AND OLD.status IS DISTINCT FROM 'graduated' THEN
      NEW.program_end_date := CURRENT_DATE;
    ELSIF NEW.active = false AND OLD.active = true AND NEW.status != 'graduated' THEN
      NEW.program_end_date := CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER families_stamp_program_end_date
    BEFORE UPDATE ON families
    FOR EACH ROW EXECUTE FUNCTION stamp_lcp_program_end_date();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Household adults (mirrors Twin Oaks' household_members, LCP-scoped) ──────
-- One row per adult in the home. Shelly fills this out when she adds the family;
-- every field required. Children are captured as free text per adult.

CREATE TABLE IF NOT EXISTS lcp_household_adults (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  full_name      text        NOT NULL,
  phone          text        NOT NULL,
  email          text        NOT NULL,
  children_names text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lcp_household_adults_family_idx ON lcp_household_adults(family_id);

ALTER TABLE lcp_household_adults ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lcp_staff_household_adults_all"
    ON lcp_household_adults FOR ALL
    TO authenticated
    USING (lcp_has_access())
    WITH CHECK (lcp_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Program fee payments (Audrey's log) ───────────────────────────────────────
-- Staff only — never surfaces in the participant portal (participants still
-- pay by envelope). No balance/amount-owed math is stored; "overdue" is
-- computed client-side from whether last month has a logged payment.

DO $$ BEGIN
  CREATE TYPE program_fee_method AS ENUM ('cash', 'check', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS lcp_program_fee_payments (
  id           uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid                NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  paid_date    date                NOT NULL,
  amount_cents int                 NOT NULL,
  method       program_fee_method  NOT NULL DEFAULT 'cash',
  comment      text,
  created_by   uuid                REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz         NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lcp_program_fee_payments_family_idx ON lcp_program_fee_payments(family_id);

ALTER TABLE lcp_program_fee_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lcp_staff_program_fee_all"
    ON lcp_program_fee_payments FOR ALL
    TO authenticated
    USING (lcp_has_access())
    WITH CHECK (lcp_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- LCP → Twin Oaks resident sync now lives in 0089_lcp_toc_move_in_requests.sql
-- as a TOC-staff-reviewed queue, not a silent auto-write. See that file.
