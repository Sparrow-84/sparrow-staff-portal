-- ============================================================
-- 0041_inv_remote_locations.sql
-- Adds is_remote + is_lcp_house flags to inv_locations.
-- Seeds one virtual "Remote" location per remote staff member
-- and marks the four LCP houses for the house-flip workflow.
-- ============================================================

-- ── New columns ───────────────────────────────────────────────────────────

ALTER TABLE inv_locations ADD COLUMN IF NOT EXISTS is_remote   boolean NOT NULL DEFAULT false;
ALTER TABLE inv_locations ADD COLUMN IF NOT EXISTS is_lcp_house boolean NOT NULL DEFAULT false;


-- ── Mark LCP houses ───────────────────────────────────────────────────────

UPDATE inv_locations
SET is_lcp_house = true
WHERE name IN ('Shiloh House', 'Goshen House', 'LCP Home (RV)', 'Service Volunteer Trailer');


-- ── Seed remote staff locations ───────────────────────────────────────────
-- One virtual location per remote staff member (sort_order 100+).
-- These follow all the same submission rules as physical locations.

INSERT INTO inv_locations (name, sort_order, is_remote)
SELECT v.name, v.ord, true
FROM (VALUES
  ('Andrew — Remote',  100),
  ('Shelly — Remote',  101),
  ('Teresa — Remote',  102),
  ('Susanna — Remote', 103),
  ('Bethany — Remote', 104),
  ('Audrey — Remote',  105),
  ('Lindy — Remote',   106)
) AS v(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM inv_locations WHERE name = v.name);


-- ── Assign remote locations to their staff members ────────────────────────
-- Looks up by email; silently skips if profile not yet created.
-- Idempotent: ON CONFLICT DO NOTHING.

DO $$
DECLARE
  rec    record;
  loc_id uuid;
  prof_id uuid;
BEGIN
  FOR rec IN
    SELECT loc_name, email FROM (VALUES
      ('Andrew — Remote',  'andrew@sparrowinc.org'),
      ('Shelly — Remote',  'shelly@sparrowinc.org'),
      ('Teresa — Remote',  'teresa@sparrowinc.org'),
      ('Susanna — Remote', 'operations@sparrowinc.org'),
      ('Bethany — Remote', 'bethany@sparrowinc.org'),
      ('Audrey — Remote',  'audrey@sparrowinc.org'),
      ('Lindy — Remote',   'lindy@sparrowinc.org')
    ) AS t(loc_name, email)
  LOOP
    SELECT id INTO loc_id  FROM inv_locations WHERE name       = rec.loc_name;
    SELECT id INTO prof_id FROM profiles       WHERE lower(email) = lower(rec.email);
    IF loc_id IS NOT NULL AND prof_id IS NOT NULL THEN
      INSERT INTO inv_location_assignments (location_id, user_id)
      VALUES (loc_id, prof_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
