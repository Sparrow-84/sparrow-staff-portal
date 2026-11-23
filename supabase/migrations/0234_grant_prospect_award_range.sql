-- 0234: Grant prospects — free-text "Award range" replaces the numeric "Estimated amount" on screen.
-- Run any time (independent). Idempotent.
--
-- Requested 2026-11-23 by Susanna: a single estimated number can't be known ahead of time;
-- what a funder actually publishes is a range or a fixed size ("$5,000", "$20k–$60k",
-- "up to $15k"). Free text holds it exactly as written.
--
-- est_amount is left in place, untouched: the Award button still copies it into the new
-- Active Grant's Amount where one exists. It's just no longer shown or edited.
--
-- Each prospect that already has an estimate gets it carried over as text (15000 -> "$15,000")
-- so nothing typed so far disappears from the table.

ALTER TABLE grant_prospects ADD COLUMN IF NOT EXISTS award_range text;

UPDATE grant_prospects
SET award_range = '$' || to_char(est_amount, 'FM999,999,999,999')
WHERE award_range IS NULL
  AND est_amount IS NOT NULL;

NOTIFY pgrst, 'reload schema';
