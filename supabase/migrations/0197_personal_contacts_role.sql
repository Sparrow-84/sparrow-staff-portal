-- My Contacts gets its own Role field (partnership_connections and partners already have
-- one), so "Add to Directory" can carry a person's title across as the Directory record's
-- contact-person role instead of it getting typed into the name.
--
-- Also moves roles that were typed into the name field back out into Role -- verified by
-- hand against live data on 2026-11-04, these are the only rows that match:
--   personal_contacts (4):        "Jeff Carter (Pastor)", "Michael Beach (Pastor)",
--                                 "Bruce White (Pastor)", "Rachel Profitt (Pastor)"
--   partnership_connections (3):  "Benjamin "Benji" Davalos / Call Center Manager",
--                                 "LK Fowler / Job Connection Employment Specialist",
--                                 "Rylee Diaz / Men's Shelter Assistant Manager"
-- "Lindsey Zarfas / Josie Wolf" is two people (Role already = Co-Owners) and is left alone --
-- the connections update only touches rows whose Role is empty.
--
-- Safe to re-run: the column add is IF NOT EXISTS, and both updates only match names that
-- still contain the pattern and have no role yet.

ALTER TABLE personal_contacts ADD COLUMN IF NOT EXISTS role text;

-- "Name (Role)" -> name = Name, role = Role
UPDATE personal_contacts
SET
  role = trim(substring(name from '\(([^)]+)\)\s*$')),
  name = trim(regexp_replace(name, '\s*\([^)]+\)\s*$', ''))
WHERE name ~ '\([^)]+\)\s*$'
  AND (role IS NULL OR trim(role) = '');

-- "Name / Role" -> name = Name, role = Role (split on the last " / ")
UPDATE partnership_connections
SET
  role = trim(regexp_replace(name, '^.*\s/\s', '')),
  name = trim(regexp_replace(name, '\s/\s[^/]*$', ''))
WHERE name ~ '\s/\s'
  AND (role IS NULL OR trim(role) = '');
