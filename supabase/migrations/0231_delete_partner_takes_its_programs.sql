-- 0231: Deleting a Directory record also deletes its Resident Services programs.
-- Run any time (independent). Idempotent.
--
-- Found 2026-11-19 (Susanna's test: "Permanently delete" on a test organization said
-- "Deleting…" forever). resident_services.partner_id was ON DELETE SET NULL, but a program must
-- have an organization or a provider name (resident_services_has_provider), so deleting any
-- organization that had a program -- even an archived one -- was refused by the database.
--
-- "Permanently delete" is for records that never should have exist (a test, a typo'd
-- duplicate); a real relationship that ended is Archive. So its programs go with it, the same
-- way its contacts, addresses, check-ins and To review item already do (all ON DELETE CASCADE).
-- The delete confirmation in the record drawer now says how many programs go too.
-- Program locations follow (resident_service_locations is already ON DELETE CASCADE).

ALTER TABLE resident_services DROP CONSTRAINT IF EXISTS resident_services_partner_id_fkey;
ALTER TABLE resident_services
  ADD CONSTRAINT resident_services_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
