-- Fix task_comments SELECT policy.
-- 0047 fixed the INSERT policy but left SELECT with the same nested EXISTS
-- pattern. When task_comments_select runs exists(select 1 from tasks ...) it
-- triggers tasks RLS in nested evaluation, which can return 0 rows even when
-- the comment was just inserted. Fix: replicate the task visibility conditions
-- inline so no nested RLS evaluation occurs.

drop policy if exists task_comments_select on task_comments;
create policy task_comments_select on task_comments
  for select to authenticated using (
    exists (
      select 1 from tasks t
      where t.id = task_id
        and (
          t.assignee_id = auth.uid()
          or t.created_by = auth.uid()
          or manages(t.assignee_id)
          or is_admin()
        )
    )
  );
