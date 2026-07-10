-- 0065_calendar_labels.sql
-- Calendar label system: user-defined and admin-managed labels replace kind-based color-coding.
-- Scope rules:
--   preset    — "Internal Meeting"; always visible to everyone; cannot be edited or deleted
--   all_staff — org-wide labels (Stat Holiday, All-Staff Meeting, Org Event); admin-managed
--   dept      — department-level labels; any dept member can create; shared within that dept
--   personal  — created by one user for their personal calendar; visible to creator only

CREATE TABLE IF NOT EXISTS calendar_labels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  color      text        NOT NULL,                               -- matches LABEL_COLORS id values
  scope      text        NOT NULL CHECK (scope IN ('preset', 'all_staff', 'dept', 'personal')),
  created_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  department department,                                         -- null for preset/all_staff
  is_preset  boolean     NOT NULL DEFAULT false,
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Universal preset (appears in every calendar's picker)
INSERT INTO calendar_labels (name, color, scope, is_preset, sort_order)
VALUES ('Internal Meeting', 'green', 'preset', true, 0);

-- All Staff labels (admin-managed; shown when posting to All Staff calendar)
INSERT INTO calendar_labels (name, color, scope, is_preset, sort_order)
VALUES
  ('All-Staff Meeting', 'blue',   'all_staff', true, 1),
  ('Stat Holiday',      'lime',   'all_staff', true, 2),
  ('Org Event',         'orange', 'all_staff', true, 3);

-- Add label_id to calendar_events
-- Nullable in DB; the UI form requires it, but existing events are left as-is.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS label_id uuid REFERENCES calendar_labels(id) ON DELETE SET NULL;

-- ── RLS ──────────────────────────────────────────────────────────────

ALTER TABLE calendar_labels ENABLE ROW LEVEL SECURITY;

-- Read: presets + all_staff labels visible to everyone; dept labels visible to all;
-- personal labels visible to creator only.
CREATE POLICY "read calendar_labels" ON calendar_labels
  FOR SELECT TO authenticated USING (
    is_preset
    OR scope = 'all_staff'
    OR scope = 'dept'
    OR (scope = 'personal' AND created_by = auth.uid())
  );

-- Insert: staff create personal/dept labels for themselves; admins create all_staff labels.
CREATE POLICY "insert calendar_labels" ON calendar_labels
  FOR INSERT TO authenticated WITH CHECK (
    (scope IN ('personal', 'dept') AND created_by = auth.uid())
    OR (scope = 'all_staff' AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ))
  );

-- Update: creator edits their own non-preset labels; admins edit all_staff labels.
CREATE POLICY "update calendar_labels" ON calendar_labels
  FOR UPDATE TO authenticated USING (
    NOT is_preset
    AND (
      created_by = auth.uid()
      OR (scope = 'all_staff' AND EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
      ))
    )
  );

-- Delete: same rules as update.
CREATE POLICY "delete calendar_labels" ON calendar_labels
  FOR DELETE TO authenticated USING (
    NOT is_preset
    AND (
      created_by = auth.uid()
      OR (scope = 'all_staff' AND EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
      ))
    )
  );
