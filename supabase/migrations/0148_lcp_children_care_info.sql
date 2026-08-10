-- Migration 0148: LCP childcare info per child, from the signed Childcare
-- Waiver/Release form.
--
-- Shelly's request (2026-08-10): the paper form lumps "physical or mental
-- limitations (allergies, hearing, sight, etc.)" and food restrictions into
-- one blob. Susanna wants these separated into distinct fields, plus a
-- catchall for anything else, so a future childcare volunteer (portal not
-- yet built) can scan exactly what they need without reading a paragraph.
--
-- All 5 fields live on lcp_household_children (same table as the child's
-- name/DOB) -- deliberately NOT synced to Twin Oaks. The TOC sync functions
-- (request_or_sync_lcp_toc / approve_lcp_toc_move_in, latest in
-- 0096_lcp_adult_email_dedup.sql) only ever SELECT full_name for the
-- children_names string on tenants -- adding columns here is invisible to
-- that sync, and TOC staff have no reason to see childcare-specific info
-- (allergies, behavioral notes) that isn't theirs to act on. Confirmed with
-- Susanna 2026-08-10 that TOC does not need this data.

ALTER TABLE lcp_household_children ADD COLUMN IF NOT EXISTS allergies_general text;
ALTER TABLE lcp_household_children ADD COLUMN IF NOT EXISTS allergies_food text;
ALTER TABLE lcp_household_children ADD COLUMN IF NOT EXISTS physical_limitations text;
ALTER TABLE lcp_household_children ADD COLUMN IF NOT EXISTS mental_behavioral text;
ALTER TABLE lcp_household_children ADD COLUMN IF NOT EXISTS special_instructions text;
