-- 0167_notepad.sql
-- "Notepad" — a freeform, private note not tied to any calendar event. Distinct from
-- Ideas (a someday/future backlog, one-line-ish, checked off when done) and Calendar
-- Notes (meeting-specific, indexed by event). Notepad entries are for right-now writing:
-- longer, formatted, no completion concept.
--
-- Labels are personal-scope only, same shape as stat_labels (0159) -- one person's label
-- set is invisible to and unusable by anyone else, unlike calendar_labels which has a
-- shared dept/all_staff tier. No approval/consistency machinery needed here because
-- there's no cross-person visibility to keep consistent.

CREATE TABLE IF NOT EXISTS notepad_labels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  color      text        NOT NULL,                 -- matches a LABEL_COLORS id
  created_by uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notepad_entries (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      text        NOT NULL,
  body       text        NOT NULL DEFAULT '',       -- rich text HTML, same convention as touchpoint summaries
  label_id   uuid        REFERENCES notepad_labels(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notepad_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE notepad_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY notepad_labels_all ON notepad_labels
    FOR ALL
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY notepad_entries_all ON notepad_entries
    FOR ALL
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
