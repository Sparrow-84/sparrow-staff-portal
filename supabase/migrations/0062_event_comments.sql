-- 0062_event_comments.sql
-- Comments + @mentions on calendar events. Mirrors the task_comments pattern.

create table if not exists event_comments (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references calendar_events(id) on delete cascade,
  author_id  uuid        not null references profiles(id) on delete cascade,
  body       text        not null check (char_length(body) > 0),
  created_at timestamptz not null default now()
);

create index if not exists event_comments_event_idx on event_comments(event_id);

alter table event_comments enable row level security;

-- Any authenticated user can read (event RLS already scopes what events they can reach)
create policy event_comments_select on event_comments
  for select to authenticated using (true);

-- Authors can insert their own comments
create policy event_comments_insert on event_comments
  for insert to authenticated with check (author_id = auth.uid());

-- Authors can delete their own comments
create policy event_comments_delete on event_comments
  for delete to authenticated using (author_id = auth.uid());

-- SECURITY DEFINER RPC for @mention notifications (notifications table has no direct INSERT policy)
create or replace function event_comment_notify_mentions(
  p_mentioned_ids uuid[],
  p_actor_id      uuid,
  p_event_id      uuid,
  p_body          text
) returns void
  language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if p_mentioned_ids is null or array_length(p_mentioned_ids, 1) is null then
    return;
  end if;
  foreach uid in array p_mentioned_ids loop
    if uid is distinct from p_actor_id then
      insert into notifications (user_id, actor_id, type, entity, entity_id, body)
      values (uid, p_actor_id, 'mentioned', 'event', p_event_id, p_body);
    end if;
  end loop;
end $$;

grant execute on function event_comment_notify_mentions(uuid[], uuid, uuid, text) to authenticated;
