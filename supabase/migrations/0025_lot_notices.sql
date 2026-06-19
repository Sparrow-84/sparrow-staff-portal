-- Lot notices (lease violations, warnings, eviction notices).
-- Linked to space (persists past tenant turnover) and optionally to tenant at time of issue.
-- TOC staff and admins can view and create. Admins can delete.

DO $$ BEGIN
  CREATE TYPE notice_type AS ENUM ('1','2','3','E');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notice_delivery AS ENUM ('in_person','left_on_door','mailed','posted','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS lot_notices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  tenant_id       uuid REFERENCES tenants(id) ON DELETE SET NULL,
  notice_type     notice_type NOT NULL,
  notice_date     date NOT NULL,
  description     text NOT NULL,
  delivery_method notice_delivery NOT NULL,
  delivery_notes  text,                        -- e.g. "left with neighbor Jane"
  created_by      uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lot_notices_space_idx  ON lot_notices(space_id);
CREATE INDEX IF NOT EXISTS lot_notices_tenant_idx ON lot_notices(tenant_id);
CREATE INDEX IF NOT EXISTS lot_notices_date_idx   ON lot_notices(notice_date DESC);

CREATE TRIGGER lot_notices_updated_at BEFORE UPDATE ON lot_notices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE lot_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY ln_read   ON lot_notices FOR SELECT TO authenticated USING (can_see_residents());
CREATE POLICY ln_insert ON lot_notices FOR INSERT TO authenticated WITH CHECK (can_see_residents() AND created_by = auth.uid());
CREATE POLICY ln_update ON lot_notices FOR UPDATE TO authenticated USING (can_see_residents()) WITH CHECK (can_see_residents());
CREATE POLICY ln_delete ON lot_notices FOR DELETE TO authenticated USING (is_admin());
