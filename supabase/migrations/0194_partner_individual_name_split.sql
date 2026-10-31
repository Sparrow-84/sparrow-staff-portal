-- Splits individual (person) partner records into first_name/last_name so the directory can
-- display and sort them "Last, First" -- organizations (business/nonprofit/church/prayer
-- sub_category, or anything without an individual sub_category) are completely untouched;
-- they keep using `name` as their one org name exactly as before. Depends on sub_category
-- (added in 0193) -- must run after it.
--
-- Backfill approach, verified by hand against every live sub_category='individual' record
-- before writing this (43 records: 37 donor-side individuals minus the 5 business/church
-- ones already excluded by 0193's own sub_category classification, plus 6 prayer->volunteer
-- records) -- last word of `name` = last_name, everything before it = first_name:
--   - Plain two-word names ("Jenna Wenger") split cleanly.
--   - Middle initials ("Samuel R Basden", "Thomas C Cope") fold into first_name as typed
--     ("Samuel R") -- still correct, just keeps the initial with the first name.
--   - Joint/couple donor records ("Aaron & Brenda Deneui") split to last_name="Deneui",
--     first_name="Aaron & Brenda" -- reads correctly as "Deneui, Aaron & Brenda", a normal
--     way to list a couple under one record; not a bug.
--   - The one record 0193 already flagged as a genuinely ambiguous sub_category
--     ("American Endowment Foundation — Barbra Devyldere") is explicitly excluded here too --
--     splitting it would put "American Endowment Foundation — Barbra" in first_name, which
--     is wrong. Left NULL/NULL; it displays as its plain `name` like an organization would,
--     same as before this migration, until a human sets it by hand.
--
-- `name` itself is NOT changed or dropped -- it remains the single source of truth other code
-- already keys off (search, dedup, task titles, etc.); first_name/last_name are purely
-- additive, used only for Last-First display/sort and kept in sync by the app whenever either
-- is edited going forward.

ALTER TABLE partners ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS last_name text;

COMMENT ON COLUMN partners.first_name IS
  'Individuals only -- set alongside last_name, kept in sync with `name` by the app. NULL for organizations.';
COMMENT ON COLUMN partners.last_name IS
  'Individuals only -- used for "Last, First" display/sort. NULL for organizations or an individual record not yet split by a human (e.g. the one flagged ambiguous case below).';

UPDATE partners
SET
  last_name = CASE WHEN name ~ '\s' THEN regexp_replace(name, '^.*\s', '') ELSE NULL END,
  first_name = CASE WHEN name ~ '\s' THEN regexp_replace(name, '\s+\S+$', '') ELSE NULL END
WHERE sub_category = 'individual'
  AND name <> 'American Endowment Foundation — Barbra Devyldere';
