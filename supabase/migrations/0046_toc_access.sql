-- Add toc_access flag for granular Twin Oaks Room access control.
-- TOC department + admins retain existing implicit access via can_see_residents();
-- this column lets any other staff member be granted the same access without
-- changing their department (e.g. Exec or Ops staff who need resident data).
-- Run AFTER 0045.

alter table profiles add column if not exists toc_access boolean not null default false;

-- Extend the existing RLS helper to include the explicit grant.
create or replace function can_see_residents() returns boolean
  language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and (role = 'admin' or department = 'toc' or toc_access)
  );
$$;
