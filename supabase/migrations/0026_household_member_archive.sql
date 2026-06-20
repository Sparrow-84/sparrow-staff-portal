-- Preserves household member records when a resident moves out or is archived individually.
-- Adds tenant_id so archived members stay linked to their former tenant record,
-- and is_archived flag so active members can be filtered from archived ones.

ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS tenant_id   uuid REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS hm_tenant_idx   ON household_members(tenant_id);
CREATE INDEX IF NOT EXISTS hm_archived_idx ON household_members(is_archived);
