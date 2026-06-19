-- Special home designation on spaces.
-- Replaces earlier lcp_house_name plan with a flexible system:
--   lcp  → LCP participant home; designation_label holds house name (Goshen, Shiloh, etc.)
--   sv   → Service Volunteer home; shows "SV" on grid
--   pm   → Property Manager home; shows "PM" on grid
--   other → Custom; designation_label holds whatever staff typed, shown on grid
-- Only one designation per space (nullable = none).

ALTER TABLE spaces ADD COLUMN IF NOT EXISTS designation_type  text;
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS designation_label text;
