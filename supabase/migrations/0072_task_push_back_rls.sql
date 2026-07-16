-- "Push back" (bounce a task back to whoever created it) was silently failing for
-- any assignee who wasn't also the task's manager/creator/admin: the UPDATE's WITH
-- CHECK required the *new* row to still satisfy created_by/assignee_id/manages/is_admin
-- for the acting user, but after a push-back the acting user is no longer the
-- assignee and usually isn't the creator or an admin either — so the reassignment
-- was rejected by RLS even though the "pushed back" comment had already been added,
-- making it look like the task silently refused to leave the person's plate.
drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks
  for update to authenticated using (
    created_by = auth.uid() or assignee_id = auth.uid() or manages(assignee_id) or is_admin()
  ) with check (
    created_by = auth.uid() or assignee_id = auth.uid() or manages(assignee_id) or is_admin()
    or assignee_id = created_by  -- anyone holding a task may push it back to its creator
  );
