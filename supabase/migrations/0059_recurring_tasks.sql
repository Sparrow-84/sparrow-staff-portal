-- Add recurrence_id to tasks (idempotent).
-- All occurrences of a recurring series share the same recurrence_id.
-- Enables "delete this + all future" by filtering on recurrence_id + due_date.
alter table tasks add column if not exists recurrence_id uuid;
create index if not exists idx_tasks_recurrence_id on tasks(recurrence_id) where recurrence_id is not null;
