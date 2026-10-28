-- Migration 0188: Stats tab -- month/year-only source dates + a citation box.
--
-- Bethany's asks: (1) a lot of reports only give month/year, not a specific
-- day, and she wants to be able to log just that rather than being forced to
-- pick a full date. Susanna's explicit call (2026-10-28): don't default to
-- the 1st of the month and pretend that's accurate -- track that the day is
-- genuinely unknown, since accurate info matters more than having something
-- filled in. (2) A freeform citation box she can copy/paste elsewhere later,
-- matching the existing "Copy stat text" pattern already on this room's
-- view screen.
--
-- source_date itself is left alone (still a plain date, used for sorting --
-- day-unknown entries store the 1st of the month there) -- the new boolean
-- is purely about what gets DISPLAYED: "October 2026" instead of a specific,
-- unearned day. Defaults to true so every existing stat (which does have a
-- real day) is unaffected.
--
-- Uses `select('*')` in stats.ts's getStats(), so this is safe to land
-- whenever Byron gets to it -- no code path selects these columns by name,
-- unlike the 0186 incident.

ALTER TABLE stats ADD COLUMN IF NOT EXISTS source_date_day_known boolean NOT NULL DEFAULT true;
ALTER TABLE stats ADD COLUMN IF NOT EXISTS citation text;
