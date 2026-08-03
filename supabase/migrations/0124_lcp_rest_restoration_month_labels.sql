-- ============================================================
-- 0124_lcp_rest_restoration_month_labels.sql
-- Follow-up to 0123 (Bathroom moved into Rest & Restoration).
--
-- month_label was still assigned per the OLD unit order (Bathroom
-- "Month 5", Master Bedroom "Month 6", Kids' Bedroom "Month 7" — i.e.
-- Bathroom-first). Reassigns the same three existing label values onto
-- the new Kids' -> Master -> Bathroom order, per Susanna's sign-off
-- 2026-08-03. Does not touch the pre-existing Living Room/Kitchen &
-- Dining month-label overlap (Month 3-4 / Month 4-5) — out of scope,
-- not understood well enough to safely change here.
-- ============================================================

UPDATE lcp_units SET month_label = 'Month 5' WHERE name = 'Kids'' Bedroom';
UPDATE lcp_units SET month_label = 'Month 6' WHERE name = 'Master Bedroom';
UPDATE lcp_units SET month_label = 'Month 7' WHERE name = 'Bathroom';
