-- 0232: New staff can sign in even if they were assigned things before their first login.
-- Run any time (independent). Idempotent. URGENT: Teresa and Raymond can't sign in until this runs.
--
-- Found 2026-11-20 at the Teresa/Raymond/Andrew rollout. Both got an error on Google sign-in.
--
-- How first sign-in works: each staff member is pre-loaded in profiles with a placeholder id
-- (Teresa = ...0008, Raymond = ...0007). On their first Google sign-in, handle_new_user()
-- swaps that placeholder for their real login id (UPDATE profiles SET id = new.id).
--
-- The bug: about half the tables that point at profiles(id) were created without
-- ON UPDATE CASCADE, so the database REFUSES to change a profile's id while any of those rows
-- point at the old one. Teresa (1) and Raymond (2) have rows in inv_location_assignments from
-- being assigned inventory locations before they ever signed in. So the swap fails, the
-- sign-in trigger errors, and Supabase rejects the login ("Database error saving new user").
-- Staff who signed in before being assigned anything never hit this.
--
-- Fix: every foreign key to profiles(id) now follows the id change (ON UPDATE CASCADE).
-- Delete behavior is kept exactly as it was on each constraint. Profile ids only ever change
-- through this sign-in swap, so cascading is safe. Covers future new staff too.
--
-- After it runs, Teresa and Raymond just sign in again with Google -- nothing else to do.
-- Their inventory assignments, chat memberships, and notifications follow them automatically.
--
-- Check (should return 0):
--   SELECT count(*) FROM pg_constraint
--   WHERE contype = 'f' AND confrelid = 'public.profiles'::regclass AND confupdtype <> 'c';

DO $$
DECLARE
  r   record;
  def text;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
      AND c.confupdtype <> 'c'
  LOOP
    -- Drop any explicit ON UPDATE clause (NO ACTION isn't printed; RESTRICT / SET NULL would be)
    def := regexp_replace(r.def, '\s+ON UPDATE (NO ACTION|RESTRICT|SET NULL|SET DEFAULT)', '', 'i');
    -- Add ON UPDATE CASCADE right after "REFERENCES profiles(id)"; ON DELETE ... stays as-is
    def := regexp_replace(def, '(REFERENCES\s+\S+\([^)]*\))', '\1 ON UPDATE CASCADE');

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tbl, r.conname, def);
  END LOOP;
END $$;
