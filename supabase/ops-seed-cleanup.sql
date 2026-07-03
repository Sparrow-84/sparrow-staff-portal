-- ops-seed-cleanup.sql
-- Removes all demo/test data inserted by seed_operations.sql.
-- Run once in the Supabase SQL editor. Safe to re-run (deletes nothing if already clean).

-- Steps first (FK references checklists)
delete from ops_checklist_steps
where checklist_id in (select id from ops_checklists);

delete from ops_checklists;
delete from ops_touchpoints;
delete from ops_staff_notes;
delete from ops_reviews;
delete from ops_issues;
