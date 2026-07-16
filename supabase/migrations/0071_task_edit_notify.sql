-- Assigners can now edit tasks they delegated (previously locked read-only).
-- To avoid instructions changing under an assignee who already read the task
-- and started work, notify them clearly whenever someone else edits it.
create or replace function notify_task_edit() returns trigger
  language plpgsql security definer set search_path = public as $$
declare editor uuid;
begin
  editor := auth.uid();

  if editor is null or editor = NEW.assignee_id then
    return NEW; -- the assignee editing their own task needs no notice
  end if;
  if NEW.assignee_id is distinct from OLD.assignee_id then
    return NEW; -- reassignment already covered by notify_task_assignment
  end if;

  if NEW.title is distinct from OLD.title
     or NEW.notes is distinct from OLD.notes
     or NEW.due_date is distinct from OLD.due_date
     or NEW.department is distinct from OLD.department
     or NEW.priority is distinct from OLD.priority
     or NEW.label is distinct from OLD.label
  then
    insert into notifications (user_id, actor_id, type, task_id, body)
    values (NEW.assignee_id, editor, 'edited', NEW.id, NEW.title);
  end if;

  return NEW;
end $$;

drop trigger if exists task_edit_notify on tasks;
create trigger task_edit_notify
  after update on tasks
  for each row execute function notify_task_edit();
