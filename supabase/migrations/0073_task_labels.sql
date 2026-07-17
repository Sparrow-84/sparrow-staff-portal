-- Personal, reusable task labels. Unlike calendar_labels, there's only one scope:
-- fully private to whoever created it — no sharing, no admin/dept tier. The `tasks`
-- table itself is untouched (still stores label/label_color as plain text); this
-- table is just each person's saved list that feeds the picker dropdown.
CREATE TABLE IF NOT EXISTS task_labels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  color      text        NOT NULL,                               -- matches LABEL_COLORS id values
  created_by uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_labels_created_by_idx ON task_labels(created_by);

ALTER TABLE task_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_labels_all" ON task_labels
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
