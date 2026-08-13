-- ============================================================
-- 0157_toc_space_vacancy_sync.sql
-- Fixes a real gap found live: a lot's Occupied/Vacant status and its
-- actual tenant record were completely disconnected. Only one narrow
-- path (the "Move Out" button, moveOutTenant() in housing.ts) ever set
-- a space back to vacant — a separate "Lot Details" form can also set
-- status independently via a plain dropdown, with no link to whether
-- a tenant record exists at all. When Byron's TOC test-data cleanup
-- deleted the fake tenant rows directly (not through the Move Out
-- button), the affected lots' status never got touched — 47 real lots
-- were confirmed live showing "occupied" with zero tenant records at
-- all behind them.
--
-- Fix: two triggers on tenants (delete, and status/space_id change)
-- that check whether the space they left still has any active tenant
-- — if not, and the space is currently 'occupied', flip it to
-- 'vacant'. Works regardless of what caused the tenant row to go away
-- (the app's own button, a future cleanup script, a direct DB edit),
-- not just the one code path that happened to handle it before.
--
-- Deliberately narrow: only ever corrects 'occupied' → 'vacant' when
-- there's truly nobody there. Never touches 'reserved' or
-- 'maintenance' — those legitimately have no tenant yet, and this
-- isn't meant to make status fully computed, just to close the one
-- gap where "occupied" could point at nobody.
-- ============================================================

CREATE OR REPLACE FUNCTION vacate_space_on_tenant_delete() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.space_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenants WHERE space_id = OLD.space_id AND status = 'active'
  ) THEN
    UPDATE spaces SET status = 'vacant' WHERE id = OLD.space_id AND status = 'occupied';
  END IF;
  RETURN OLD;
END $$;

DO $$ BEGIN
  CREATE TRIGGER tenants_vacate_space_on_delete
    AFTER DELETE ON tenants
    FOR EACH ROW EXECUTE FUNCTION vacate_space_on_tenant_delete();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION vacate_space_on_tenant_status_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.space_id IS NOT NULL
     AND (OLD.space_id IS DISTINCT FROM NEW.space_id OR NEW.status <> 'active')
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM tenants WHERE space_id = OLD.space_id AND status = 'active'
    ) THEN
      UPDATE spaces SET status = 'vacant' WHERE id = OLD.space_id AND status = 'occupied';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER tenants_vacate_space_on_status_change
    AFTER UPDATE OF status, space_id ON tenants
    FOR EACH ROW EXECUTE FUNCTION vacate_space_on_tenant_status_change();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- One-time correction for the drift that already exists: any space
-- currently marked occupied with no active tenant behind it at all.
UPDATE spaces
SET status = 'vacant'
WHERE status = 'occupied'
  AND NOT EXISTS (SELECT 1 FROM tenants WHERE tenants.space_id = spaces.id AND tenants.status = 'active');
