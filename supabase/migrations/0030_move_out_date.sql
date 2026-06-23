-- Migration 0030: add move_out_date to tenants
-- Records the date the household actually vacated (as reported by staff at move-out time).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS move_out_date date;
