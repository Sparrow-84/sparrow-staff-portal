-- Fix: the roster match only lowercased emails, never trimmed whitespace. A stray
-- leading/trailing space on either side (login_email entered by staff, or the email
-- typed/pasted into the sign-up form) silently failed to match, rejecting a valid
-- family/staff account. Trim both sides in addition to lowercasing.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.email is null then
    raise exception 'No email on account';
  end if;

  -- Staff (Google sign-in, allowlisted by profiles)
  update profiles set id = new.id, active = true
  where lower(trim(email)) = lower(trim(new.email));
  if found then
    return new;
  end if;

  -- LifeChange family (email + password, allowlisted by families.login_email)
  update families set auth_id = new.id
  where lower(trim(login_email)) = lower(trim(new.email)) and active = true;
  if found then
    return new;
  end if;

  raise exception 'Email % is not on the Sparrow roster (staff or LifeChange family)', new.email;
end $$;
