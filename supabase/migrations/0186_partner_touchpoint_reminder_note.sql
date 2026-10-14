-- Migration 0186: optional custom wording on a partner's "touchpoint due" reminder.
--
-- Susanna's call on Bethany's "opt out of follow-up for The Hive" ask: don't
-- actually remove the reminder -- The Hive needs one MORE than most, since a
-- casual conversation with someone there doesn't mean Sparrow has actually
-- given the church a real update, and Bethany could easily feel caught-up
-- when she isn't. What's needed instead is the generic "Touchpoint due"
-- wording replaced with something specific: "When did you last stand up and
-- give the church a Sparrow update? Do this every 6 months."
--
-- This only changes what the reminder SAYS -- cadence_days/last_touchpoint_at
-- and the underlying due-date math are completely unchanged. Null by default,
-- so every existing partner's reminder looks exactly as it did before.

ALTER TABLE partners ADD COLUMN IF NOT EXISTS touchpoint_reminder_note text;
