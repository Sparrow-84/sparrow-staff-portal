-- Stats tab (Stories & Media room, 3rd tab) — a place for Bethany to keep
-- verified, exact-wording statistics she pulls from for presentations,
-- collateral, and website copy. Same room, same access flag/function as
-- Stories (stories_has_access(), from 0093) -- no new profile column needed.
--
-- Deliberately NOT a clone of the stories table itself: stories has no
-- verified/source concept to copy (its old `status` field was dropped in
-- 0094 as unnecessary) -- source + verified are new here because citations
-- are the actual hard-to-recover thing Bethany described.
--
-- Labels ARE a direct clone of story_tags (0098) -- same shape, same shared-
-- library RLS, just a separate table so Stories tags and Stats labels don't
-- get mixed into one dropdown.

CREATE TABLE IF NOT EXISTS stats (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_text     text        NOT NULL,             -- the exact wording/number -- verbatim, not paraphrased
  context       text,                              -- optional: what it's about / short note
  source        text        NOT NULL,             -- citation, e.g. "2024 Benton County Point-in-Time Count"
  source_url    text,
  source_date   date,                              -- date of the underlying data (distinct from date logged)
  verified      boolean     NOT NULL DEFAULT false,
  verified_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at   timestamptz,
  labels        text[]      NOT NULL DEFAULT '{}', -- stores stat_labels.name values, same convention as stories.tags
  used_in       text,
  logged_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stat_labels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  color      text        NOT NULL,                 -- matches a LABEL_COLORS id
  created_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE stat_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stats_access" ON stats;
CREATE POLICY "stats_access" ON stats
  FOR ALL TO authenticated
  USING (stories_has_access())
  WITH CHECK (stories_has_access());

DROP POLICY IF EXISTS "stat_labels_access" ON stat_labels;
CREATE POLICY "stat_labels_access" ON stat_labels
  FOR ALL TO authenticated
  USING (stories_has_access())
  WITH CHECK (stories_has_access());
