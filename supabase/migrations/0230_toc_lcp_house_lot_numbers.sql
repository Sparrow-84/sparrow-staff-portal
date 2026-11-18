-- 0230: Put the two LCP houses on their correct TOC lot numbers.
--
-- Shiloh House is lot 37 (was entered as 34). Goshen House is lot 31 (was entered as 33).
--
-- The house's row was simply labeled with the wrong lot number, so this swaps the
-- labels: the Shiloh row becomes "37" and the empty "37" row becomes "34"; the Goshen
-- row becomes "31" and the empty "31" row becomes "33". Everything attached to the
-- house (tenant, household members, LCP family link) stays attached, and nothing is
-- left pointing at the wrong number. Text copies of the lot number on move-in requests
-- and incidents are synced to match. Also clears leftover rent on the now-empty lot 34.
--
-- Safe to re-run: each swap only happens while the house is still on the wrong number
-- and the correct lot is still empty (no designation, no active tenant).

DO $$
DECLARE
  house_id uuid;
  empty_id uuid;
  pair record;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES ('Shiloh%', '34', '37'), ('Goshen%', '33', '31')) AS v(house, wrong_lot, right_lot)
  LOOP
    house_id := NULL;
    empty_id := NULL;

    SELECT id INTO house_id FROM spaces
     WHERE label = pair.wrong_lot AND designation_label ILIKE pair.house;

    SELECT id INTO empty_id FROM spaces s
     WHERE s.label = pair.right_lot
       AND s.designation_type IS NULL
       AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.space_id = s.id AND t.status = 'active');

    IF house_id IS NULL OR empty_id IS NULL THEN
      RAISE NOTICE '0230: % already on lot % (or lot % not empty) — skipped', pair.house, pair.right_lot, pair.right_lot;
      CONTINUE;
    END IF;

    UPDATE spaces SET label = '__0230_tmp' WHERE id = house_id;
    UPDATE spaces SET label = pair.wrong_lot WHERE id = empty_id;
    UPDATE spaces SET label = pair.right_lot WHERE id = house_id;
  END LOOP;
END $$;

-- The empty lot that was "37" (now "34") carried leftover rent ($650, "current")
-- with nobody living there. Clear it to match the other empty lots.
UPDATE spaces s
   SET current_rent = 0, rent_status = 'na'
 WHERE s.label = '34'
   AND s.designation_type IS NULL
   AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.space_id = s.id AND t.status = 'active')
   AND (s.current_rent IS DISTINCT FROM 0 OR s.rent_status IS DISTINCT FROM 'na');

-- Keep stored text copies of the lot number in step with the lot they point to.
UPDATE lcp_toc_move_in_requests r
   SET space_label = s.label
  FROM spaces s
 WHERE s.id = r.toc_space_id
   AND s.label IN ('31', '33', '34', '37')
   AND r.space_label IS DISTINCT FROM s.label;

UPDATE toc_incidents i
   SET lot_label = s.label
  FROM spaces s
 WHERE s.id = i.lot_id
   AND s.label IN ('31', '33', '34', '37')
   AND i.lot_label IS DISTINCT FROM s.label;
