-- Follow-up to 0193: that migration retyped every partner's PRIMARY type away from the
-- retired categories (church/business -> community, prayer -> volunteer) but only cleaned
-- the retired lcp_referral value out of SECONDARY types (secondary_types) -- it missed doing
-- the same retype for church/business/prayer there. Two real records (confirmed via direct
-- query before writing this) still carried secondary_types = {prayer} from before the
-- rebuild: Donor records also tagged as a prayer volunteer. That stale value crashed
-- PartnerTileView in production the moment Byron ran 0193 -- it looks up each secondary
-- type's display info by the old value, which no longer exists, and the resulting undefined
-- crashed the whole view (fixed defensively in the app code in the same deploy as this
-- migration; this migration is the matching data fix so the stale value isn't just hidden,
-- it's actually corrected).
--
-- Mirrors 0193's own primary-type retype exactly, applied to the secondary array instead:
-- church/business -> community, prayer -> volunteer (preserves the "also a volunteer" signal
-- rather than silently dropping it). foundation/advisory/fst have no equivalent in the new
-- model and are just removed if present -- confirmed zero records affected by this migration,
-- included only so a future stray value can't cause the same crash again.

UPDATE partners
SET secondary_types = array_replace(secondary_types, 'church'::partner_type, 'community'::partner_type)
WHERE 'church' = ANY(secondary_types);

UPDATE partners
SET secondary_types = array_replace(secondary_types, 'business'::partner_type, 'community'::partner_type)
WHERE 'business' = ANY(secondary_types);

UPDATE partners
SET secondary_types = array_replace(secondary_types, 'prayer'::partner_type, 'volunteer'::partner_type)
WHERE 'prayer' = ANY(secondary_types);

UPDATE partners
SET secondary_types = array_remove(array_remove(array_remove(secondary_types,
      'foundation'::partner_type), 'advisory'::partner_type), 'fst'::partner_type)
WHERE secondary_types && ARRAY['foundation', 'advisory', 'fst']::partner_type[];

-- A record's own primary type can now accidentally duplicate into its own secondary_types
-- array as a side effect of the two replacements above (e.g. a record primary-typed
-- 'community' that also had secondary 'church' now has secondary_types containing
-- 'community' twice over -- once from whatever it already was, once from this migration).
-- Dedupe defensively, unconditionally -- a no-op write on any row that was already clean.
UPDATE partners
SET secondary_types = ARRAY(SELECT DISTINCT unnest(secondary_types))
WHERE secondary_types IS NOT NULL AND array_length(secondary_types, 1) > 0;

-- And a record should never list its own primary type as a secondary type too.
UPDATE partners
SET secondary_types = array_remove(secondary_types, type)
WHERE type = ANY(secondary_types);
