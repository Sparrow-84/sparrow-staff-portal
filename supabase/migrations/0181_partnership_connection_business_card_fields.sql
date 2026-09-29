-- Migration 0181: Meaningful Connections -- business-card fields.
--
-- Bethany's ask: a connection today only captures name + organization, but a
-- business card handed over at an event usually has more -- phone, email,
-- website, and the person's role/title. Add those to partnership_connections
-- so they don't get lost or crammed into what_discussed.
--
-- Matching columns go on `partners` too: when a connection becomes a partner
-- (AddPartnerPanel's "Become a partner" prefill), all of this needs somewhere
-- to land so nothing is dropped in the handoff.

ALTER TABLE partnership_connections
  ADD COLUMN IF NOT EXISTS role    text,
  ADD COLUMN IF NOT EXISTS phone   text,
  ADD COLUMN IF NOT EXISTS email   text,
  ADD COLUMN IF NOT EXISTS website text;

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS role    text,
  ADD COLUMN IF NOT EXISTS website text;
