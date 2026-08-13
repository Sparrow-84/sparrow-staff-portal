-- ============================================================
-- 0153_inv_items_donated_nullable.sql
-- Allows inv_items.is_donated to be NULL, meaning "unknown" —
-- distinct from false ("known not donated"). The 2026-07 historical
-- import (0083) had to set every row to true/false, but most rows in
-- the source spreadsheet never actually said either way. Defaulting
-- those to false quietly overstated confidence the register never
-- had. NULL now means "not yet verified" and shows as "Unknown" in
-- the Asset Register / Table view rather than a guessed "No".
--
-- Going forward, the monthly submission form still requires an
-- explicit Yes/No for new items — NULL is only for items whose
-- provenance was never recorded at intake.
-- ============================================================

ALTER TABLE inv_items ALTER COLUMN is_donated DROP NOT NULL;
ALTER TABLE inv_items ALTER COLUMN is_donated DROP DEFAULT;
