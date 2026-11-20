-- 0233: Inventory sub-locations — Raymond's shed numbers + two Laundry Room areas.
-- Run any time (independent). Idempotent. Looks rows up by name, not id.
--
-- Requested 2026-11-20 at Raymond's inventory rollout.
--
-- Outdoor Areas: Raymond numbers the 3 main sheds, so the names now carry his numbers and
-- sort in that order. Renames keep the same row, so every item already filed under a shed
-- stays there (Steel Shed (laundry room) 11 items, Steel Shed (office) 7, Timber Shed 2).
--   Steel Shed (laundry room) -> 1. Steel Shed (by laundry room)
--   Timber Shed               -> 2. Timber Shed
--   Steel Shed (office)       -> 3. Steel Shed (by office)
--   Visitor Parking Shed and Behind the Sheds keep their names, listed after the 3 sheds.
--
-- Laundry Room had no sub-locations at all. Adds:
--   Main Laundry Room and Bathrooms
--   Laundry Room Storage

DO $$
DECLARE
  v_outdoor uuid;
  v_laundry uuid;
BEGIN
  SELECT id INTO v_outdoor FROM inv_locations WHERE name = 'Outdoor Areas';
  SELECT id INTO v_laundry FROM inv_locations WHERE name = 'Laundry Room';

  IF v_outdoor IS NOT NULL THEN
    UPDATE inv_sub_locations SET name = '1. Steel Shed (by laundry room)'
      WHERE location_id = v_outdoor AND name = 'Steel Shed (laundry room)';
    UPDATE inv_sub_locations SET name = '2. Timber Shed'
      WHERE location_id = v_outdoor AND name = 'Timber Shed';
    UPDATE inv_sub_locations SET name = '3. Steel Shed (by office)'
      WHERE location_id = v_outdoor AND name = 'Steel Shed (office)';

    UPDATE inv_sub_locations s SET sort_order = v.ord
    FROM (VALUES
      ('1. Steel Shed (by laundry room)', 1),
      ('2. Timber Shed',                  2),
      ('3. Steel Shed (by office)',       3),
      ('Visitor Parking Shed',            4),
      ('Behind the Sheds',                5)
    ) AS v(name, ord)
    WHERE s.location_id = v_outdoor AND s.name = v.name;
  END IF;

  IF v_laundry IS NOT NULL THEN
    INSERT INTO inv_sub_locations (location_id, name, sort_order) VALUES
      (v_laundry, 'Main Laundry Room and Bathrooms', 1),
      (v_laundry, 'Laundry Room Storage',            2)
    ON CONFLICT (location_id, name) DO NOTHING;
  END IF;
END $$;
