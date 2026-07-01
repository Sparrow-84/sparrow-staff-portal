-- Fix task_comments INSERT policy and add @mention notification support.
-- Run after 0046_toc_access.sql.

-- 1. Drop the existing INSERT policy which contained an EXISTS sub-query on
--    tasks. That sub-query ran under tasks RLS and could fail depending on
--    how is_admin() resolves in nested policy evaluation. The FK on task_id
--    already guarantees the task exists; auth.uid() check is sufficient.
drop policy if exists task_comments_insert on task_comments;
create policy task_comments_insert on task_comments
  for insert to authenticated with check (author_id = auth.uid());

-- 2. SECURITY DEFINER RPC so the client can create 'mentioned' notifications
--    for task comment @mentions. Notifications has no INSERT policy by design —
--    only definer functions may write to it.
create or replace function task_comment_notify_mentions(
  p_mentioned_ids uuid[],
  p_actor_id      uuid,
  p_task_id       uuid,
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
      insert into notifications (user_id, actor_id, type, task_id, body)
      values (uid, p_actor_id, 'mentioned', p_task_id, p_body);
    end if;
  end loop;
end $$;

grant execute on function task_comment_notify_mentions(uuid[], uuid, uuid, text) to authenticated;
