-- 0227: Resident Services sees an organization's check-ins (both kinds) and can log its own.
-- Run AFTER 0226. Idempotent (each policy is dropped and re-created).
--
-- Decided with the product owner 2026-11-13: Partnerships' "touchpoints" are now called
-- check-ins in the app ("Upcoming check-ins" = scheduled, partner_checkins; "Check-in history"
-- = what happened, partner_touchpoints -- table names unchanged). Resident Services should see
-- pretty much everything about an organization in its room, so its staff don't call a partner
-- to ask what Partnerships already knows; Partnerships sees which sections are shared.
--
-- Before this, only Partnerships staff (and a record's owner) could read check-ins, so someone
-- with Resident Services access alone saw nothing. Each policy below covers ONLY organizations
-- in the Resident Services room (partner_in_resident_services: has a program, or is in To
-- review) -- never people records, never other organizations. These are added alongside the
-- existing Partnerships policies (Postgres ORs them), which are untouched.
--
--   * Check-in history (partner_touchpoints): read all; log new ones as themselves; edit or
--     delete only the ones they logged.
--   * Upcoming check-ins (partner_checkins): read only. Scheduling stays with Partnerships.

DROP POLICY IF EXISTS touchpoints_select_resident_services ON partner_touchpoints;
CREATE POLICY touchpoints_select_resident_services ON partner_touchpoints FOR SELECT TO authenticated
  USING (resident_services_has_access() AND partner_in_resident_services(partner_id));

DROP POLICY IF EXISTS touchpoints_insert_resident_services ON partner_touchpoints;
CREATE POLICY touchpoints_insert_resident_services ON partner_touchpoints FOR INSERT TO authenticated
  WITH CHECK (
    resident_services_has_access() AND partner_in_resident_services(partner_id)
    AND logged_by = auth.uid()
  );

DROP POLICY IF EXISTS touchpoints_update_own_resident_services ON partner_touchpoints;
CREATE POLICY touchpoints_update_own_resident_services ON partner_touchpoints FOR UPDATE TO authenticated
  USING (
    logged_by = auth.uid()
    AND resident_services_has_access() AND partner_in_resident_services(partner_id)
  )
  WITH CHECK (
    logged_by = auth.uid()
    AND resident_services_has_access() AND partner_in_resident_services(partner_id)
  );

DROP POLICY IF EXISTS touchpoints_delete_own_resident_services ON partner_touchpoints;
CREATE POLICY touchpoints_delete_own_resident_services ON partner_touchpoints FOR DELETE TO authenticated
  USING (
    logged_by = auth.uid()
    AND resident_services_has_access() AND partner_in_resident_services(partner_id)
  );

DROP POLICY IF EXISTS partner_checkins_select_resident_services ON partner_checkins;
CREATE POLICY partner_checkins_select_resident_services ON partner_checkins FOR SELECT TO authenticated
  USING (resident_services_has_access() AND partner_in_resident_services(partner_id));
