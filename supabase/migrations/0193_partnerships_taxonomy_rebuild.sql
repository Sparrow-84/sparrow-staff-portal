-- Partnerships taxonomy rebuild — collapses the old flat type list down to three real
-- categories (donor, community [displayed "Community Partner"], volunteer) plus a new
-- sub_category describing what kind of entity a record is. Foundation, Advisory, FST, and
-- general Volunteer are left defined in the partner_type enum (removing enum values is far
-- riskier than just not using them) but are confirmed to have zero records, primary or
-- secondary, as of this migration -- nothing to migrate for any of them.
--
-- Every change below is an UPDATE on existing rows (plus one explicit test-record DELETE
-- Susanna asked for directly) -- no rows are dropped as a side effect, no columns holding
-- real content are removed without their data being preserved first. Verified against live
-- data before writing this file: 37 donor / 40 church / 11 community / 6 prayer / 1 business,
-- zero using foundation/advisory/fst/volunteer anywhere.

-- ── 0. Remove the one explicit test record Susanna asked to clean up ───────────────────
DELETE FROM partners WHERE name = 'Susanna (Tester)' AND organization = 'Fancy Feet';

-- ── 1. New sub_category ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE partner_sub_category AS ENUM ('individual', 'business', 'nonprofit', 'church', 'prayer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE partners ADD COLUMN IF NOT EXISTS sub_category partner_sub_category;

-- ── 2. Populate sub_category from the OLD type, before any type values change ───────────
UPDATE partners SET sub_category = 'church' WHERE type = 'church' AND sub_category IS NULL;
UPDATE partners SET sub_category = 'business' WHERE type = 'business' AND sub_category IS NULL;
UPDATE partners SET sub_category = 'prayer' WHERE type = 'prayer' AND sub_category IS NULL;
-- The 11 original `community` records are all nonprofits/ministries/civic orgs (checked by
-- name individually -- Benton County Prayer Team, C.H.A.N.C.E., CO Labor Ministries,
-- Crossroad Communities, DevNW, Good News Club, Kari Kingsolver/Arc Benton County, Kiwanis
-- Club of Corvallis, Love Inc, Southside Youth Outreach). None read as a for-profit business.
UPDATE partners SET sub_category = 'nonprofit' WHERE type = 'community' AND sub_category IS NULL;

-- Donors: organization is NULL on all 37 (nothing to key off there), so classified by name.
-- Businesses by name:
UPDATE partners SET sub_category = 'business'
  WHERE type = 'donor' AND name IN ('Auskie Ag, LLC', 'Golan, LLC', 'Seaders Tree Care', 'Bright Funds')
  AND sub_category IS NULL;
-- A church that gives, logged purely as a Donor today (not also tagged Community Partner --
-- not changing that relationship, just recording what kind of entity it is):
UPDATE partners SET sub_category = 'church'
  WHERE type = 'donor' AND name = 'Desert Streams Church' AND sub_category IS NULL;
-- American Endowment Foundation (the Barbra Devyldere DAF) is a genuinely ambiguous case --
-- defaulting to individual since the underlying relationship is about her personal legacy
-- giving, not an organization Sparrow has a relationship with. Flagged for a spot-check.
-- Every remaining donor is a person or named individual/family:
UPDATE partners SET sub_category = 'individual' WHERE type = 'donor' AND sub_category IS NULL;

-- ── 3. Retype church/business into community, prayer into volunteer ────────────────────
-- (sub_category was captured from the OLD type above, so nothing is lost by this retype.)
UPDATE partners SET type = 'community' WHERE type = 'church';
UPDATE partners SET type = 'community' WHERE type = 'business';
UPDATE partners SET type = 'volunteer' WHERE type = 'prayer';

-- ── 4. Partner Provides: text -> text[], preserving every existing value ────────────────
-- Existing free-text partner_provides is real, specific content (8 records have it) that
-- doesn't map cleanly onto the new preset list -- copying it into notes verbatim rather than
-- guessing a preset, so nothing is lost. The new array column starts empty for those records;
-- staff re-tag with real presets next time they touch the record.
UPDATE partners
SET notes = COALESCE(notes || E'\n\n', '') || 'Partner provides (migrated from the old free-text field): ' || partner_provides
WHERE partner_provides IS NOT NULL AND partner_provides <> '';

ALTER TABLE partners ADD COLUMN IF NOT EXISTS partner_provides_tags text[] NOT NULL DEFAULT '{}';

-- The two records already flagged lcp_referral get the one clean, already-decided mapping:
UPDATE partners
SET partner_provides_tags = array_append(partner_provides_tags, 'LCP Participant Referral')
WHERE 'lcp_referral' = ANY(secondary_types);

-- lcp_referral is retired as a category -- drop it from every secondary_types array now that
-- its meaning has moved to partner_provides_tags.
UPDATE partners
SET secondary_types = array_remove(secondary_types, 'lcp_referral')
WHERE 'lcp_referral' = ANY(secondary_types);

-- Old free-text column kept for one release as a safety net (already copied into notes above,
-- and the app will stop reading it) -- drop it in a later migration once confirmed unneeded.
COMMENT ON COLUMN partners.partner_provides IS
  'Deprecated -- migrated into notes and partner_provides_tags by 0193. Safe to drop once confirmed unused.';

-- ── 5. Lead time on partner records -- confirmed dead code (the real due-soon calculation
-- already hardcodes a flat window and never reads this), actively misleading to keep ───────
ALTER TABLE partners DROP COLUMN IF EXISTS lead_time_days;

-- ── 6. Touchpoints: replace the generic recurring cadence with one-off named items ───────
-- "Subscribed to TSM" (already shipped) now covers the default plan for most relationships.
-- `needs_additional_touchpoint` unlocks a single named, dated item for the relationships
-- that genuinely need one (mainly Community Partners) -- e.g. "MOU check-in -- due Oct 2028",
-- not a recurring rhythm. cadence_days represented the old recurring-rhythm concept this
-- replaces, and is just as dead as lead_time_days was once this lands.
ALTER TABLE partners ADD COLUMN IF NOT EXISTS needs_additional_touchpoint boolean NOT NULL DEFAULT false;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS additional_touchpoint_label text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS additional_touchpoint_due date;

-- Carry the signal forward, not the exact math: any Community Partner that had a real
-- cadence set under the old model was being actively tracked for a reason -- rather than
-- silently dropping that, flag it for a real named item so a human reviews and renames it,
-- instead of inventing a specific label ourselves. Donors and Volunteers are NOT carried
-- forward -- the new design covers them fully through TSM + their fixed thank-yous, so
-- reviving their old cadence here would just recreate the clutter this redesign removes.
UPDATE partners
SET needs_additional_touchpoint = true,
    additional_touchpoint_label = 'Review touchpoint plan (carried over from the old cadence)',
    additional_touchpoint_due = (COALESCE(last_touchpoint_at::date, created_at::date) + (cadence_days || ' days')::interval)::date
WHERE type = 'community' AND cadence_days IS NOT NULL;

ALTER TABLE partners DROP COLUMN IF EXISTS cadence_days;

-- ── 7. "Done" status for comms production milestones (did not exist before) ─────────────
ALTER TABLE partnership_comms_milestones ADD COLUMN IF NOT EXISTS completed_at timestamptz;
