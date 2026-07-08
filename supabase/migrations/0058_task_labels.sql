-- Add optional label fields to tasks (idempotent).
-- label      = user-typed name, e.g. "Personal", "Client work"
-- label_color = one of 8 preset color IDs ('red'|'orange'|'amber'|'lime'|'teal'|'blue'|'violet'|'pink')
alter table tasks add column if not exists label       text;
alter table tasks add column if not exists label_color text;
