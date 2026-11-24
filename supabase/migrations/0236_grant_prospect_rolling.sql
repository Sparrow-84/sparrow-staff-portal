-- 0236: "Rolling — no fixed dates" checkbox on Grants prospects (Susanna, 2026-11-24).
-- For funders that take applications any time. When it's ticked, the table shows
-- "Rolling" under Application opens and "None" under Deadline.
--
-- Adds one yes/no column that starts as "no" for every existing grant. Touches no other data.
-- Safe to run twice.

ALTER TABLE grant_prospects ADD COLUMN IF NOT EXISTS rolling boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
