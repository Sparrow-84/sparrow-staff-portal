-- 0101_ideas.sql
-- New "Ideas" list (part of the Notes tab). A private scratchpad, not attached to any
-- calendar event: staff can drop a quick title + optional longer description at any time,
-- check it off, or delete it. Fully personal — no sharing tier, same model as
-- meeting_notes (private prep/live notes) and task_labels (personal labels).

CREATE TABLE IF NOT EXISTS ideas (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  description  text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ideas_all ON ideas
    FOR ALL
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
