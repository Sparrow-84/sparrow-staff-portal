-- Each lot has its own street address (TOC has multiple streets; no shared unit-number system).
-- street_number: the house number (e.g. "241")
-- street_name:   the street (e.g. "SW Mobile Place", "SW Twin Oaks Circle")

ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS street_number text,
  ADD COLUMN IF NOT EXISTS street_name   text;
