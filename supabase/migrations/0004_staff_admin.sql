-- Sparrow Staff Portal — admin staff management (System 2)
-- Lets admins add/remove staff and adjust their access (role, department, manager).
-- Run AFTER 0001_init.sql.

-- Admins may add new staff (roster entries) and remove them.
-- (Editing existing staff is already covered by the profiles_update_self policy,
--  which allows is_admin() to update anyone.)
create policy profiles_insert_admin on profiles
  for insert to authenticated with check (is_admin());
create policy profiles_delete_admin on profiles
  for delete to authenticated using (is_admin());

-- Make deactivation real: the sign-in linker now only links ACTIVE roster
-- profiles and no longer auto-reactivates. Unknown or deactivated emails are
-- rejected at login. (Replaces the function from 0001; the trigger is unchanged.)
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.email is null then
    raise exception 'No email on account';
  end if;

  update profiles set id = new.id
  where lower(email) = lower(new.email) and active = true;

  if not found then
    raise exception 'Email % is not on the Sparrow staff roster (or has been deactivated)', new.email;
  end if;

  return new;
end $$;
