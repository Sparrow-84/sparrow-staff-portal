-- ============================================================
-- 0104_inv_location_owner.sql
-- Adds is_owner flag to inv_location_assignments.
-- For locations shared by multiple staff, one person is the
-- designated submitter. Either can still submit if needed.
-- Idempotent: IF NOT EXISTS / column already exists is safe.
-- ============================================================

ALTER TABLE inv_location_assignments
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;
