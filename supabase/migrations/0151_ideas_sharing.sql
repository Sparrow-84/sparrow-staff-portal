-- Migration 0151: Ideas sharing (Bethany's request, 2026-08-11).
--
-- Kept deliberately simple, per Susanna: one boolean, no per-person audience
-- picker. "My Ideas" (private, default) is unchanged; flipping an idea to
-- shared makes it visible to every staff member under a new "Team Ideas"
-- list -- still only editable/deletable by whoever created it.

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS shared boolean NOT NULL DEFAULT false;

-- Additive to the existing own-rows-only ideas_all policy (Postgres OR's
-- multiple permissive policies for the same command) -- read-only, doesn't
-- touch write access at all.
DO $$ BEGIN
  CREATE POLICY ideas_shared_select ON ideas
    FOR SELECT TO authenticated
    USING (shared = true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
