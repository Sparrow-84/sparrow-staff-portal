-- Pet records per lot (one row per pet).
-- Linked to space so history survives tenant turnover.
-- RLS mirrors household_members: TOC staff and admins only.

CREATE TABLE IF NOT EXISTS pets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id   uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  pet_type   text NOT NULL,          -- 'dog' | 'cat' | 'bird' | 'fish' | 'other'
  name       text,
  notes      text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pets_space_idx ON pets(space_id);

CREATE TRIGGER pets_updated_at BEFORE UPDATE ON pets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE pets ENABLE ROW LEVEL SECURITY;

CREATE POLICY pets_select ON pets FOR SELECT TO authenticated USING (can_see_residents());
CREATE POLICY pets_write  ON pets FOR ALL    TO authenticated USING (can_see_residents()) WITH CHECK (can_see_residents());
