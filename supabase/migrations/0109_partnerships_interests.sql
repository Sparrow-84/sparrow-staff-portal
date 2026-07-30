-- Partnerships room: "Interests" — a shared, staff-built tag library (mirrors the calendar
-- label system: name + color, anyone with access can create new ones) so Bethany can find
-- every donor/partner drawn to a given cause (kids, poverty, LCP, etc.) for targeted
-- outreach — e.g. inviting everyone interested in kids' programs to a new playground
-- announcement. Unlike calendar labels (one per event), a partner can hold many interests
-- at once, so this is a shared library table + a separate many-to-many join table rather
-- than a single label_id column.

CREATE TABLE IF NOT EXISTS partnership_interests (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  label      text        NOT NULL,
  color      text        NOT NULL,                    -- matches LABEL_COLORS id values
  created_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_interests (
  partner_id  uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  interest_id uuid NOT NULL REFERENCES partnership_interests(id) ON DELETE CASCADE,
  PRIMARY KEY (partner_id, interest_id)
);

CREATE INDEX IF NOT EXISTS partner_interests_interest_idx ON partner_interests(interest_id);

ALTER TABLE partnership_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_interests ENABLE ROW LEVEL SECURITY;

-- Fully shared library, not creator-locked (unlike calendar dept labels) — any partnerships
-- staff member can create, edit, or delete any interest, since this is a small shared team
-- vocabulary and locking edits to the original creator would just make typo fixes annoying.
DO $$ BEGIN
  CREATE POLICY partnership_interests_all ON partnership_interests
    FOR ALL TO authenticated
    USING (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY partner_interests_all ON partner_interests
    FOR ALL TO authenticated
    USING (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
