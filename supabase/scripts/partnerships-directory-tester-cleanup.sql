-- Partnerships Directory test-data cleanup — safe to run any time, idempotent.
-- Byron: run this in Supabase -> SQL Editor.
--
-- Removes the 2 "Tester -- safe to delete" partner records created while testing the
-- Add Partner flow on 2026-08-08 (yolo@gmail.com). Confirmed via direct read-only DB
-- check: zero donations, zero touchpoints, zero interests on either row — safe to
-- hard-delete outright. There is no "delete partner" button in the app (partners are
-- meant to only ever be archived, to preserve real donor/touchpoint history), so this
-- one-time cleanup has to run directly against the DB instead.
--
-- Also cleans up the 2 leftover "Touchpoint due" tasks + their notifications that the
-- reminder system correctly generated for these test partners (already marked done,
-- purely cosmetic clutter otherwise).

BEGIN;

DELETE FROM notifications
WHERE task_id IN (
  SELECT id FROM tasks
  WHERE source_ref IN (
    'touchpoint:3e618463-33f4-4ad2-b440-05d40f8119a4',
    'touchpoint:1da50ed4-1aa5-43f9-be05-e75343fa16c3'
  )
);

DELETE FROM tasks
WHERE source_ref IN (
  'touchpoint:3e618463-33f4-4ad2-b440-05d40f8119a4',
  'touchpoint:1da50ed4-1aa5-43f9-be05-e75343fa16c3'
);

DELETE FROM partners
WHERE id IN (
  '3e618463-33f4-4ad2-b440-05d40f8119a4',
  '1da50ed4-1aa5-43f9-be05-e75343fa16c3'
);

COMMIT;
