-- Push-back rework. Previously the client did a comment insert + a plain tasks
-- update, which had two problems:
--   1. Reliability — reassigning away from yourself needed the 0072 RLS carve-out,
--      and staff testing it saw the task stay on their own plate with no clear
--      signal of what went wrong.
--   2. Notifications — the generic comment + assignment triggers each fired their
--      own vague notification ("commented on a task" / "assigned you a task"),
--      neither of which told the assigner who pushed back what, or why, and
--      clicking either just opened the task list, not the task itself.
-- This wraps the whole action in one SECURITY DEFINER RPC: it verifies the caller
-- is the current assignee, reassigns unconditionally (no RLS dependency), writes
-- the explanation as a task comment, and raises exactly one 'pushed_back'
-- notification — suppressing the generic triggers for this one transaction via a
-- session-local flag so the assigner doesn't also get a "commented"/"assigned" pair.

create or replace function push_back_task(p_task_id uuid, p_note text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  t record;
  actor uuid := auth.uid();
begin
  select assignee_id, created_by, title into t from tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found.';
  end if;
  if t.created_by is null then
    raise exception 'This task has no assigner to push back to.';
  end if;
  if t.assignee_id is distinct from actor then
    raise exception 'Only the current assignee can push this task back.';
  end if;

  perform set_config('sparrow.suppress_task_notify', 'true', true);

  insert into task_comments (task_id, author_id, body)
  values (p_task_id, actor, 'Pushed back: ' || coalesce(nullif(trim(p_note), ''), 'No reason given'));

  update tasks set assignee_id = t.created_by where id = p_task_id;

  insert into notifications (user_id, actor_id, type, task_id, body)
  values (t.created_by, actor, 'pushed_back', p_task_id, t.title);
end $$;

grant execute on function push_back_task(uuid, text) to authenticated;

-- Both generic triggers skip their own insert when the RPC above has already
-- raised the one notification that should represent this action.
create or replace function notify_comment() returns trigger
  language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if current_setting('sparrow.suppress_task_notify', true) = 'true' then
    return NEW;
  end if;

  select assignee_id, created_by, title into t from tasks where id = NEW.task_id;

  if t.assignee_id is distinct from NEW.author_id then
    insert into notifications (user_id, actor_id, type, task_id, body)
    values (t.assignee_id, NEW.author_id, 'commented', NEW.task_id, t.title);
  end if;

  if t.created_by is distinct from NEW.author_id and t.created_by is distinct from t.assignee_id then
    insert into notifications (user_id, actor_id, type, task_id, body)
    values (t.created_by, NEW.author_id, 'commented', NEW.task_id, t.title);
  end if;

  return NEW;
end $$;

create or replace function notify_task_assignment() returns trigger
  language plpgsql security definer set search_path = public as $$
declare actor uuid;
begin
  if current_setting('sparrow.suppress_task_notify', true) = 'true' then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    actor := NEW.created_by;
  elsif NEW.assignee_id is distinct from OLD.assignee_id then
    actor := auth.uid();
  else
    return NEW; -- assignee unchanged on update
  end if;

  if NEW.assignee_id is distinct from actor then
    insert into notifications (user_id, actor_id, type, task_id, body)
    values (NEW.assignee_id, actor, 'assigned', NEW.id, NEW.title);
  end if;
  return NEW;
end $$;
