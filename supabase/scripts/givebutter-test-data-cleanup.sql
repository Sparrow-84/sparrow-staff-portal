-- Givebutter test data cleanup — run any time
-- Deletes the "Jane Doe" partner + donation created by the 2026-07-31
-- end-to-end webhook test (GiveButter's built-in sample transaction.succeeded
-- payload). Safe to run more than once (no-ops if already gone).
-- Byron: run this in Supabase -> SQL Editor.

BEGIN;

-- Sanity check first if you want to confirm before running the deletes:
-- SELECT id, name, email, donor_tier FROM partners WHERE name = 'Jane Doe' AND email = 'jane@example.com';
-- SELECT id, given_by_name, given_by_email, givebutter_id FROM donations WHERE givebutter_id = 'sample_tid';

-- Step 1: delete the test donation row
DELETE FROM donations
WHERE givebutter_id = 'sample_tid';

-- Step 2: delete the test partner (only if it has no other real donations/touchpoints attached)
DELETE FROM partner_touchpoints
WHERE partner_id IN (
  SELECT id FROM partners WHERE name = 'Jane Doe' AND email = 'jane@example.com'
);

DELETE FROM partners
WHERE name = 'Jane Doe' AND email = 'jane@example.com'
  AND NOT EXISTS (SELECT 1 FROM donations WHERE partner_id = partners.id);

COMMIT;

-- To verify after running:
-- SELECT count(*) FROM partners WHERE name = 'Jane Doe' AND email = 'jane@example.com';
-- SELECT count(*) FROM donations WHERE givebutter_id = 'sample_tid';
