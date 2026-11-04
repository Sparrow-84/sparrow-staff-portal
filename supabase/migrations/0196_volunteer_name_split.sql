-- Follow-up to 0194: that migration only split first_name/last_name for sub_category =
-- 'individual' records, which excludes every Volunteer -- Volunteer's only sub_category is
-- 'prayer' (describing a kind of volunteering, not an entity type), not 'individual', even
-- though every Volunteer is a person. Result: all 6 live Volunteer records were silently
-- skipped and still display "First Last" instead of "Last, First" like every other person
-- record. The app code's definition of "is this a person" (isPersonRecord(), in
-- partnerships-types.ts) was fixed in the same deploy as this migration to also cover
-- type = 'volunteer'; this is the matching data fix.
--
-- Verified by hand against all 6 live records before writing this -- every one is a plain,
-- unambiguous "First Last" name (Miranda Martinez, Brittany Wenger, Kevin Nichols, David
-- Livingston, Karen Cornwell, Jenna Wenger) -- no couples, no middle initials, no ambiguous
-- org-like names of the kind 0194 had to carve out an exception for. Same split rule as
-- 0194: last word = last_name, everything before it = first_name.

UPDATE partners
SET
  last_name = regexp_replace(name, '^.*\s', ''),
  first_name = regexp_replace(name, '\s+\S+$', '')
WHERE type = 'volunteer'
  AND sub_category = 'prayer'
  AND first_name IS NULL
  AND last_name IS NULL
  AND name ~ '\s';
