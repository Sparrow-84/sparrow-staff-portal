-- LCP Housing Savings test-data cleanup — safe to run any time, idempotent.
-- Byron: run this in Supabase -> SQL Editor.
--
-- Removes a test "May" entry Susanna created on Kim Wilson's family
-- (aff68a95-1313-4516-90c4-530ae51dd4d8) while testing the old month-by-month
-- Housing Savings flow, before migration 0150 switched it to automatic weekly
-- tracking. It isn't real — Susanna doesn't know whether that month was
-- actually "perfect" or not, so rather than guess at awarded=true/false the
-- row should just not exist, matching every other real family (Perez,
-- Tiffany Cox), which have zero rows in this table.
--
-- There is no delete affordance in the app for this table on purpose — old
-- months are shown read-only as frozen history (see migration 0150's
-- comment), and even before that switch the UI only ever let staff correct a
-- month by re-answering it, never remove it outright (see migration 0129).
-- So this one-time cleanup has to run directly against the DB instead.
--
-- Confirmed Kim Wilson's family.housing_savings_cents / _legacy_cents /
-- _announced_cents are all already 0 (same as Perez/Cox) — this delete is the
-- only change needed; no other column needs resetting.

BEGIN;

DELETE FROM lcp_housing_savings_months
WHERE family_id = 'aff68a95-1313-4516-90c4-530ae51dd4d8';

COMMIT;
