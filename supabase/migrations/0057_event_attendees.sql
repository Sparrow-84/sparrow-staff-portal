-- 0057_event_attendees.sql
-- RSVP/attendance system for calendar events.
--
-- Dept events default OFF widget until an 'attending' row exists for the user.
-- All Staff events (dept = null) default ON widget until an 'opted_out' row exists.
-- Personal events are unaffected (always visible to creator only, no attendees).

-- 1. Attendees table
create table if not exists event_attendees (
  event_id   uuid        not null references calendar_events(id) on delete cascade,
  staff_id   uuid        not null references profiles(id)        on delete cascade,
  status     text        not null check (status in ('attending', 'opted_out')),
  added_by   uuid        references profiles(id),
  created_at timestamptz not null default now(),
  primary key (event_id, staff_id)
);

-- 2. RLS
alter table event_attendees enable row level security;

-- Anyone can read attendee lists (names shown on event detail)
do $$ begin
  create policy attendees_select on event_attendees
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- Insert: own row (self opt-in/out) OR event creator adding others
do $$ begin
  create policy attendees_insert on event_attendees
    for insert to authenticated with check (
      staff_id = auth.uid()
      or exists (
        select 1 from calendar_events ce
        where ce.id = event_id and ce.created_by = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

-- Update: own row only
do $$ begin
  create policy attendees_update on event_attendees
    for update to authenticated using (staff_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Delete: own row OR event creator removing someone
do $$ begin
  create policy attendees_delete on event_attendees
    for delete to authenticated using (
      staff_id = auth.uid()
      or exists (
        select 1 from calendar_events ce
        where ce.id = event_id and ce.created_by = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

-- 3. Extend notification_type enum
alter type notification_type add value if not exists 'event_invited';
alter type notification_type add value if not exists 'event_removed';

-- 4. SECURITY DEFINER RPC so clients can insert notification rows for other users.
--    Skips notifying the actor themselves.
create or replace function notify_event_attendees(
  p_staff_ids        uuid[],
  p_actor_id         uuid,
  p_event_id         uuid,
  p_event_title      text,
  p_notification_type text   -- 'event_invited' or 'event_removed'
) returns void language plpgsql security definer as $$
declare
  v_id uuid;
begin
  foreach v_id in array p_staff_ids loop
    if v_id <> p_actor_id then
      insert into notifications (user_id, actor_id, type, entity, entity_id, body)
      values (
        v_id,
        p_actor_id,
        p_notification_type::notification_type,
        'calendar_event',
        p_event_id,
        p_event_title
      );
    end if;
  end loop;
end;
$$;

grant execute on function notify_event_attendees(uuid[], uuid, uuid, text, text) to authenticated;
