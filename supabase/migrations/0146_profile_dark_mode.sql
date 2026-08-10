-- Per-staff dark mode preference for the staff portal.
alter table profiles
  add column if not exists dark_mode boolean not null default false;
