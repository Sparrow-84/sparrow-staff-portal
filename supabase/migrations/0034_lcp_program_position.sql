-- 0034_lcp_program_position.sql
-- Adds group-level curriculum position tracking and per-family entry points.
-- All families advance through the curriculum together (group model); this table
-- records where the whole group is now. joined_unit_id on families records which
-- unit each participant entered on so gap phases can be computed.
-- Run after 0033. Schema reload after.

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS joined_unit_id int REFERENCES lcp_units(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS lcp_program_position (
  id         int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  unit_id    int NOT NULL REFERENCES lcp_units(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE lcp_program_position ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY prog_pos_read ON lcp_program_position
    FOR SELECT TO authenticated USING (lcp_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY prog_pos_write ON lcp_program_position
    FOR ALL TO authenticated
    USING (lcp_is_full()) WITH CHECK (lcp_is_full());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
