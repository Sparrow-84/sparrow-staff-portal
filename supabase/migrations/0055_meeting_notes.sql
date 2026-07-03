create table if not exists meeting_notes (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references calendar_events(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  prep_notes  text not null default '',
  live_notes  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table meeting_notes enable row level security;

create policy meeting_notes_all on meeting_notes
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
