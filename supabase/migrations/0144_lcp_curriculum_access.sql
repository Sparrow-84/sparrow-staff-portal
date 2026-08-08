-- Sparrow — LifeChange Program: split curriculum-edit rights from general LCP staff access.
--
-- Today, `profiles.lcp_role = 'full'` grants BOTH ordinary LCP staff work (families,
-- session logs, messages, vouchers, homework, compliance, etc. — all still gated on
-- lcp_is_full() and left untouched here) AND the ability to edit Curriculum Admin content
-- (Teacher Guide, devotionals, Slideshow/Handout Drive links, Monday Mentoring fields).
-- Decision (2026-08-08, Susanna): a new LCP hire should get the former by default, not
-- the latter — Curriculum Admin should be the one tab/capability they don't automatically
-- get. Adds a second, independent flag for curriculum edit rights specifically.
--
-- lcp_sessions' write policy (curric_sess_write) is intentionally left untouched: it also
-- covers `curriculum_notes` / `curriculum_notes_reviewed_at`, written from the ordinary
-- Session Log screen (SessionLog.tsx) by any full LCP staff member during/after a Thursday
-- session — that's routine session-log activity, not curriculum authoring, and must keep
-- working for everyone with general LCP access regardless of this new flag.

-- Backfill only runs the FIRST time this migration lands (guarded on the column not existing
-- yet), so a rerun can never stomp a deliberate access change made after that point.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'lcp_curriculum_access'
  ) THEN
    ALTER TABLE profiles ADD COLUMN lcp_curriculum_access boolean NOT NULL DEFAULT false;
    -- Anyone already relying on full LCP access today keeps curriculum edit rights —
    -- this migration narrows things for staff added FROM HERE ON, not retroactively.
    UPDATE profiles SET lcp_curriculum_access = true WHERE lcp_role = 'full';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION lcp_can_edit_curriculum() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND lcp_role = 'full' AND lcp_curriculum_access
  );
$$;

-- lcp_resources: Teacher Guide / devotionals / Slideshow & Handout Drive links.
DROP POLICY IF EXISTS lcp_resources_write ON lcp_resources;
CREATE POLICY lcp_resources_write ON lcp_resources FOR ALL TO authenticated
  USING (lcp_can_edit_curriculum()) WITH CHECK (lcp_can_edit_curriculum());

-- lcp_units: phase/unit structure (reorder, renaming) — structural curriculum admin only.
DROP POLICY IF EXISTS curric_units_write ON lcp_units;
CREATE POLICY curric_units_write ON lcp_units FOR ALL TO authenticated
  USING (lcp_can_edit_curriculum()) WITH CHECK (lcp_can_edit_curriculum());
