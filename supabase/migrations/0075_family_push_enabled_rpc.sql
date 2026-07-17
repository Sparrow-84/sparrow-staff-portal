-- Families have no self-service UPDATE on their own row today — families_write
-- (0005_lcp.sql) is staff-only by design, so a participant can't edit their own
-- session number, savings, status, etc. This narrow SECURITY DEFINER RPC lets a
-- signed-in family toggle only their own push_enabled flag, without opening up
-- write access to the rest of the row.
create or replace function set_my_family_push_enabled(p_enabled boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update families set push_enabled = p_enabled where auth_id = auth.uid();
end $$;
