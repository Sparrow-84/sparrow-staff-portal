-- 0163_unpin_allstaff_meeting_preset.sql
-- "All-Staff Meeting" was seeded (0065) as a permanent preset label — is_preset = true,
-- which both the UI and RLS treat as "can never be edited or deleted by anyone,"
-- including admins. Susanna has since recolored all-staff meetings onto the "Internal
-- Meeting" preset instead and wants to retire this one so it stops showing up as a
-- second, differently-colored option. Demote it to a regular admin-managed All Staff
-- label (same as "Out of Office" already is) so it shows up in Manage Labels and can be
-- edited/deleted through the normal UI. The other three presets (Internal Meeting,
-- Stat Holiday, Org Event) are untouched and stay permanent.

update calendar_labels
set is_preset = false
where name = 'All-Staff Meeting' and scope = 'all_staff' and is_preset = true;
