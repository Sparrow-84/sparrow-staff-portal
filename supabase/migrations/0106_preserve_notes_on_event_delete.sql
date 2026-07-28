-- Deleting a calendar event used to cascade-delete any meeting notes (private
-- and shared) attached to it, with no way to get them back. Instead: detach
-- notes from the deleted event (set null) and snapshot the event's title/date
-- onto the note itself first, so it still shows up under My Notes / Shared
-- Notes labeled with what meeting it was from.

alter table meeting_notes
  add column if not exists event_title text,
  add column if not exists event_starts_at timestamptz;

alter table meeting_notes alter column event_id drop not null;
alter table meeting_notes drop constraint meeting_notes_event_id_fkey;
alter table meeting_notes
  add constraint meeting_notes_event_id_fkey
  foreign key (event_id) references calendar_events(id) on delete set null;

alter table event_shared_notes
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists event_title text,
  add column if not exists event_starts_at timestamptz;

-- event_id was the primary key; give it a real surrogate id so the row can
-- survive event_id being nulled out.
alter table event_shared_notes drop constraint event_shared_notes_pkey;
alter table event_shared_notes add constraint event_shared_notes_pkey primary key (id);
alter table event_shared_notes alter column event_id drop not null;
alter table event_shared_notes add constraint event_shared_notes_event_id_key unique (event_id);
alter table event_shared_notes drop constraint event_shared_notes_event_id_fkey;
alter table event_shared_notes
  add constraint event_shared_notes_event_id_fkey
  foreign key (event_id) references calendar_events(id) on delete set null;

create or replace function snapshot_event_before_notes_delete() returns trigger
  language plpgsql as $$
begin
  update meeting_notes set event_title = old.title, event_starts_at = old.starts_at where event_id = old.id;
  update event_shared_notes set event_title = old.title, event_starts_at = old.starts_at where event_id = old.id;
  return old;
end $$;

drop trigger if exists trg_snapshot_event_before_notes_delete on calendar_events;
create trigger trg_snapshot_event_before_notes_delete
  before delete on calendar_events
  for each row execute function snapshot_event_before_notes_delete();
