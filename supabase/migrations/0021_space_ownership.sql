-- Home ownership tracking on spaces.
-- Three-way model: resident owns their home (most lots), Sparrow owns it, or a church/individual
-- donated use of the home to Sparrow (LCP only).

DO $$ BEGIN
  CREATE TYPE home_ownership AS ENUM ('resident_owned', 'sparrow_owned', 'donated_use');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE spaces ADD COLUMN IF NOT EXISTS ownership home_ownership;
