-- ============================================================
-- 0103_inv_location_assignments.sql
-- Seeds all inventory location assignments using real profile IDs.
-- Re-seeds remote locations (0041 silently skipped all — emails
-- in that migration didn't match actual profile emails in the DB).
-- Adds physical location assignments for the first time.
--
-- Profile UUIDs are hardcoded (confirmed correct in prod — the
-- original run failed only on location_id FK, not user_id FK).
-- Location IDs are looked up by name so this works regardless of
-- what UUID the live DB assigned to each location row.
-- Idempotent: ON CONFLICT DO NOTHING throughout.
-- ============================================================

DO $$
DECLARE
  loc_id     uuid;
  shelly_id  uuid := '2f74dc0f-1877-4d13-8598-9c9aec324642';
  audrey_id  uuid := '6aadf8ee-ed23-4ba8-a73a-c3ab33703db2';
  raymond_id uuid := '00000000-0000-0000-0000-000000000007';
  lindy_id   uuid := 'f4057f98-8306-40a3-8517-1422c23ecea6';
  andrew_id  uuid := 'fc80c56f-5d3e-4b39-81f0-0657f3493d11';
  teresa_id  uuid := '00000000-0000-0000-0000-000000000008';
  susanna_id uuid := '546a6ce4-7792-41ec-b2e6-12dd70f8c6d7';
  bethany_id uuid := '30714f9b-fd1d-46be-8dcc-02bc0ee2d3c2';
BEGIN

  -- ── Physical locations ──────────────────────────────────────────────────

  -- Office Building: Shelly + Audrey
  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Office Building';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, shelly_id) ON CONFLICT DO NOTHING;
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, audrey_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Outdoor Areas: Raymond
  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Outdoor Areas';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, raymond_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Laundry Room: Lindy + Raymond
  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Laundry Room';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, lindy_id)   ON CONFLICT DO NOTHING;
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, raymond_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Shiloh House: Shelly
  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Shiloh House';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, shelly_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Goshen House: Shelly
  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Goshen House';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, shelly_id) ON CONFLICT DO NOTHING;
  END IF;

  -- LCP Home (RV): Shelly
  SELECT id INTO loc_id FROM inv_locations WHERE name = 'LCP Home (RV)';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, shelly_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Service Volunteer Trailer: Shelly
  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Service Volunteer Trailer';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, shelly_id) ON CONFLICT DO NOTHING;
  END IF;

  -- ── Remote locations (re-seed; 0041 had wrong emails) ───────────────────

  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Andrew — Remote';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, andrew_id) ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Shelly — Remote';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, shelly_id) ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Teresa — Remote';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, teresa_id) ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Susanna — Remote';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, susanna_id) ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Bethany — Remote';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, bethany_id) ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Audrey — Remote';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, audrey_id) ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO loc_id FROM inv_locations WHERE name = 'Lindy — Remote';
  IF loc_id IS NOT NULL THEN
    INSERT INTO inv_location_assignments (location_id, user_id) VALUES (loc_id, lindy_id) ON CONFLICT DO NOTHING;
  END IF;

END $$;
