-- 0164_calendar_labels_admin_only_management.sql
-- Tighten who can edit/delete a shared calendar label. Previously any staff member in a
-- department could rename/recolor/delete that department's labels (the app UI even let
-- anyone in the dept try it, though the old policy actually only allowed the original
-- creator — a front-end/database mismatch this also fixes). Now that labels are visible
-- and pickable org-wide (see the app's label picker), letting anyone freely edit a shared
-- label is how colors drift apart again. Going forward: only admins can edit or delete a
-- dept or all-staff label, regardless of who created it. Personal labels are unaffected —
-- still creator-only, since those are private and never shown to anyone else. Creating a
-- new label, and picking any existing one for an event, are both untouched — this only
-- changes who can modify a label once it exists.

drop policy if exists "update calendar_labels" on calendar_labels;
create policy "update calendar_labels" on calendar_labels
  for update to authenticated using (
    not is_preset
    and (
      (scope = 'personal' and created_by = auth.uid())
      or (scope != 'personal' and exists (
        select 1 from profiles where id = auth.uid() and role = 'admin'
      ))
    )
  );

drop policy if exists "delete calendar_labels" on calendar_labels;
create policy "delete calendar_labels" on calendar_labels
  for delete to authenticated using (
    not is_preset
    and (
      (scope = 'personal' and created_by = auth.uid())
      or (scope != 'personal' and exists (
        select 1 from profiles where id = auth.uid() and role = 'admin'
      ))
    )
  );
