-- ============================================================
-- 0082_inv_review_flags.sql
-- Adds a persistent review_flag field to inv_items so open
-- questions surfaced during the historical data migration
-- (or any future register entry) stay visible in the app
-- instead of living only in a spreadsheet comment.
-- Also seeds three sub-location gaps surfaced by the historical
-- data migration (0083): "Behind the Sheds" and "Yard / Outside"
-- under Outdoor Areas / Office Building, and room-level
-- sub-locations for the Service Volunteer Trailer, which the
-- original build assumed had none but the real asset log clearly
-- distinguishes (bathroom, kitchen, living room, childcare room).
-- ============================================================

ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS review_flag text;

INSERT INTO inv_sub_locations (location_id, name, sort_order)
SELECT l.id, 'Behind the Sheds', 5
FROM inv_locations l
WHERE l.name = 'Outdoor Areas'
  AND NOT EXISTS (
    SELECT 1 FROM inv_sub_locations sl
    WHERE sl.location_id = l.id AND sl.name = 'Behind the Sheds'
  );

INSERT INTO inv_sub_locations (location_id, name, sort_order)
SELECT l.id, 'Yard / Outside', 9
FROM inv_locations l
WHERE l.name = 'Office Building'
  AND NOT EXISTS (
    SELECT 1 FROM inv_sub_locations sl
    WHERE sl.location_id = l.id AND sl.name = 'Yard / Outside'
  );

INSERT INTO inv_sub_locations (location_id, name, sort_order)
SELECT l.id, v.name, v.ord
FROM inv_locations l
JOIN (VALUES
  ('Bathroom',       1),
  ('Childcare Room', 2),
  ('Kitchen',        3),
  ('Living Room',    4),
  ('Various',        5)
) AS v(name, ord) ON true
WHERE l.name = 'Service Volunteer Trailer'
  AND NOT EXISTS (
    SELECT 1 FROM inv_sub_locations sl
    WHERE sl.location_id = l.id AND sl.name = v.name
  );
