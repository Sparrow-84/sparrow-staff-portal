-- Shared notes attached to calendar events, visible and editable by all staff.
create table if not exists event_shared_notes (
  event_id   uuid not null references calendar_events(id) on delete cascade,
  notes      text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  primary key (event_id)
);

alter table event_shared_notes enable row level security;

create policy "Authenticated users can view shared notes"
  on event_shared_notes for select to authenticated using (true);

create policy "Authenticated users can insert shared notes"
  on event_shared_notes for insert to authenticated with check (true);

create policy "Authenticated users can update shared notes"
  on event_shared_notes for update to authenticated using (true);
