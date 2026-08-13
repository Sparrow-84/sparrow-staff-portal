-- TOC test data cleanup — run before rollout
-- Fully deletes ALL fake resident/property data still sitting in the TOC room,
-- both currently "active" and past/moved-out, so real LCP participant move-ins
-- can be logged into a clean roster.
--
-- Covers:
--   - The 8 dev-seed families (lots 2, 7, 12, 19, 31, 40, 48, 52) — Maria Gonzalez,
--     James Carter, The Nguyen Family, Robert Hill, The Okafor Family, Daniel Reyes,
--     Susan Park, The Johnson Family. All fake, loaded 2026-06-05 as placeholder data.
--   - "Tester 2" — a manually-tested past resident at lot 33 (moved in 7/20, moved
--     out 8/10, staff test email). Already moved-out, but the row itself was never deleted.
--   - Lots 23 and 34 kept in this list for idempotency (an earlier, narrower run of
--     this same script already cleared their tenant data).
--   - 2 leftover work orders tied to the lot 12 / lot 40 fake tenants (confirmed
--     with Susanna before including — one was still open in Raymond's real queue).
--
-- Lots themselves (the space rows) are KEPT — they're real physical lots. This script
-- deliberately does NOT touch designation_type / designation_label / street_number /
-- street_name / vin / title_holder / photo_url, since lots 23 ("Caretaker"), 33
-- ("Goshen"), and 34 ("Shiloh") carry real property designations that must survive
-- this cleanup untouched.
--
-- Run this in Supabase → SQL Editor. Safe to run more than once.

BEGIN;

-- Step 1: capture the space IDs we're targeting (sanity check first)
-- You can run just this SELECT first to confirm before running the full script:
-- SELECT id, label, status FROM spaces WHERE label IN ('2','7','12','19','23','31','33','34','40','48','52');

-- Step 2: delete household members for tenants in these lots
DELETE FROM household_members
WHERE tenant_id IN (
  SELECT id FROM tenants
  WHERE space_id IN (
    SELECT id FROM spaces WHERE label IN ('2','7','12','19','23','31','33','34','40','48','52')
  )
);

-- Step 3: delete tenants linked to these lots (covers both active AND past/moved-out residents)
DELETE FROM tenants
WHERE space_id IN (
  SELECT id FROM spaces WHERE label IN ('2','7','12','19','23','31','33','34','40','48','52')
);

-- Step 4: delete work orders linked to these lots
-- (includes the lot 12 "Skirting panel detached" and lot 40 "Smoke detector replacement"
-- tickets — both fake-seed artifacts assigned to Raymond, confirmed OK to remove)
DELETE FROM work_orders
WHERE space_id IN (
  SELECT id FROM spaces WHERE label IN ('2','7','12','19','23','31','33','34','40','48','52')
);

-- Step 5: delete pets (also cascade-deleted when space is deleted,
-- but being explicit in case only clearing data not the space itself)
DELETE FROM pets
WHERE space_id IN (
  SELECT id FROM spaces WHERE label IN ('2','7','12','19','23','31','33','34','40','48','52')
);

-- Step 6: delete lot notices for these lots
DELETE FROM lot_notices
WHERE space_id IN (
  SELECT id FROM spaces WHERE label IN ('2','7','12','19','23','31','33','34','40','48','52')
);

-- Step 7: reset the space records themselves to clean/vacant state
-- (keeps the lot in the system as a real lot, just clears test occupancy/rent data —
-- deliberately does NOT reset designation_type/designation_label/street_number/
-- street_name/vin/title_holder/photo_url, which hold real property info on 23/33/34)
UPDATE spaces
SET
  status       = 'vacant',
  type         = 'manufactured_home',
  current_rent = 0,
  rent_status  = 'na',
  size         = NULL,
  notes        = NULL,
  ownership    = NULL
WHERE label IN ('2','7','12','19','23','31','33','34','40','48','52');

COMMIT;

-- To verify after running:
-- SELECT label, status, notes FROM spaces WHERE label IN ('2','7','12','19','23','31','33','34','40','48','52');
-- SELECT count(*) FROM tenants WHERE space_id IN (SELECT id FROM spaces WHERE label IN ('2','7','12','19','23','31','33','34','40','48','52'));
-- SELECT count(*) FROM work_orders WHERE space_id IN (SELECT id FROM spaces WHERE label IN ('12','40'));
