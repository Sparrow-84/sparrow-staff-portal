-- Home details, household members table, and enriched tenant fields.
-- household_members replaces single-adult contact fields — one row per adult per lot.

-- ─── Space / home fields ─────────────────────────────────────────────
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS affordable_housing_discount boolean NOT NULL DEFAULT false;
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS vin       text;
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS hud_label text;

DO $$ BEGIN
  CREATE TYPE title_holder AS ENUM ('resident_held', 'lienheld');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE spaces ADD COLUMN IF NOT EXISTS title_holder title_holder;

-- ─── Household members (one row per adult per lot) ────────────────────
CREATE TABLE IF NOT EXISTS household_members (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid references spaces(id) on delete cascade,
  name             text not null,
  phone            text,
  email            text,
  park_chat_opt_in boolean not null default false,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS hm_space_idx ON household_members(space_id);
CREATE INDEX IF NOT EXISTS hm_opt_in_idx ON household_members(park_chat_opt_in) WHERE phone IS NOT NULL;

CREATE TRIGGER hm_updated_at BEFORE UPDATE ON household_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY hm_select ON household_members
  FOR SELECT TO authenticated USING (can_see_residents());
CREATE POLICY hm_write ON household_members
  FOR ALL TO authenticated USING (can_see_residents()) WITH CHECK (can_see_residents());

-- ─── Tenant record enrichment ─────────────────────────────────────────
-- tenants.name is now a household label (e.g. "Smith Family") — optional display name.
-- Adult contact info lives in household_members instead.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS children_names          text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS emergency_contact_notes text;
