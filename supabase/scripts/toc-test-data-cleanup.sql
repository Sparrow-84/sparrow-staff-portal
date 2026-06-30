-- TOC test data cleanup — run before rollout
-- Fully deletes all test resident/property data for lots 23, 33, and 34.
-- Lots themselves (the space rows) are kept since they are real physical lots.
-- Byron: run this in Supabase → SQL Editor. It is safe to run more than once.

BEGIN;

-- Step 1: capture the space IDs we're targeting (sanity check first)
-- You can run just this SELECT first to confirm before running the full script:
-- SELECT id, label, status FROM spaces WHERE label IN ('23', '33', '34');

-- Step 2: delete household members for tenants in these lots
DELETE FROM household_members
WHERE tenant_id IN (
  SELECT id FROM tenants
  WHERE space_id IN (SELECT id FROM spaces WHERE label IN ('23', '33', '34'))
);

-- Step 3: delete tenants linked to these lots
DELETE FROM tenants
WHERE space_id IN (SELECT id FROM spaces WHERE label IN ('23', '33', '34'));

-- Step 4: delete work orders linked to these lots
DELETE FROM work_orders
WHERE space_id IN (SELECT id FROM spaces WHERE label IN ('23', '33', '34'));

-- Step 5: delete pets (also cascade-deleted when space is deleted,
-- but being explicit in case only clearing data not the space itself)
DELETE FROM pets
WHERE space_id IN (SELECT id FROM spaces WHERE label IN ('23', '33', '34'));

-- Step 6: delete lot notices for these lots
DELETE FROM lot_notices
WHERE space_id IN (SELECT id FROM spaces WHERE label IN ('23', '33', '34'));

-- Step 7: reset the space records themselves to clean/vacant state
-- (keeps the lot in the system as a real lot, just clears test data)
UPDATE spaces
SET
  status       = 'vacant',
  type         = 'manufactured_home',
  current_rent = 0,
  rent_status  = 'na',
  size         = NULL,
  notes        = NULL,
  ownership    = NULL
WHERE label IN ('23', '33', '34');

COMMIT;

-- To verify after running:
-- SELECT label, status, notes FROM spaces WHERE label IN ('23', '33', '34');
-- SELECT count(*) FROM tenants WHERE space_id IN (SELECT id FROM spaces WHERE label IN ('23', '33', '34'));
