-- 0136_grant_document_summaries.sql
-- Adds an optional plain-English summary to each grant document. Lives on the same
-- row as the file (not a separate linked document) so "this is a summary of this doc"
-- is automatic — one record, expand to read the summary or click through to the PDF.

ALTER TABLE grant_documents ADD COLUMN IF NOT EXISTS summary text;

-- One-time backfill for the GHAP agreement Susanna already uploaded. Matched by
-- funder name + document label (not id) since UUIDs aren't portable across
-- environments — see local-vs-prod UUID convention used elsewhere in this repo.
-- Guarded by "summary IS NULL" so re-running this migration never overwrites a
-- summary someone has since edited by hand in the app.
UPDATE grant_documents gd
SET summary = $ghap_summary$Sparrow got $1,670,000 from the State of Oregon (OHCS) in May 2021 to help buy Twin Oaks. It's a grant, not a loan — no repayment required as long as Sparrow keeps its end of the deal.

What Sparrow promised in exchange:
- Keep at least 60% of the lots rented to lower-income households (at or below 80% of the area's median income), with proof of each tenant's income kept on file
- Keep the park safe and well-maintained
- Carry insurance (at least $2 million in liability coverage) and tell OHCS within 5 days if it ever lapses or gets cancelled
- Get OHCS's written OK before selling, transferring, or taking out new loans against the property
- Send OHCS a "yes, we're still following the rules" certification once a year (exact date isn't written anywhere in this agreement — that's a real, open gap)
- File and follow a Resident Services Plan — real support services for residents, separate from the property-upkeep requirement above
- Keep all of this up for 60 years, through the end of 2081

If Sparrow doesn't keep the deal: worst case, OHCS can demand the full $1.67 million back within 30 days, extend the 60-year clock, or step in and take over management.

Bottom line: a long-term promise to keep Twin Oaks affordable, not a one-time transaction — with yearly paperwork that needs to keep happening for decades.$ghap_summary$
FROM grants g
WHERE gd.grant_id = g.id
  AND g.funder_name = 'OHCS (Oregon Housing and Community Services)'
  AND gd.label = 'GHAP 2020 Grant Agreement Twin Oaks.pdf'
  AND gd.summary IS NULL;
