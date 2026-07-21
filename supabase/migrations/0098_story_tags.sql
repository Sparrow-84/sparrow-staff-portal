-- 0098_story_tags.sql
-- Story tags become a shared, colored label library (same pattern as calendar_labels)
-- instead of free-typed comma-separated text, so staff with Stories access can define
-- their own tags and colors from a dropdown, reused consistently across stories.
-- stories.tags stays text[] (unchanged) — it now stores story_tags.name values instead
-- of free-typed strings, so no data migration is needed (0 rows exist).
-- Depends on: 0081_stories_room.sql, 0093_stories_admin_access.sql

CREATE TABLE IF NOT EXISTS story_tags (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  color      text        NOT NULL,                    -- matches a LABEL_COLORS id
  created_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE story_tags ENABLE ROW LEVEL SECURITY;

-- Shared library: anyone with Stories access (or admin, via stories_has_access()) can
-- read, create, edit, or delete any tag — same as everyone sharing the "Logged by" list.
DROP POLICY IF EXISTS "story_tags_access" ON story_tags;
CREATE POLICY "story_tags_access" ON story_tags
  FOR ALL TO authenticated
  USING (stories_has_access())
  WITH CHECK (stories_has_access());
