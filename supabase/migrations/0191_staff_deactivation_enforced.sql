-- 0191_staff_deactivation_enforced.sql
-- Makes "Deactivate" in Staff admin actually remove access, and splits off a
-- separate "hide from staff lists" setting for accounts that should keep access
-- but not appear as staff (e.g. a subcontractor).
--
-- Before this: deactivating only hid someone from the Team page, pickers and chat.
-- Anyone who had signed in before could still sign in with full access, and the
-- sign-in linker re-activated a deactivated profile on first sign-in (0004 removed
-- that; 0005 accidentally put it back by copying 0001; 0069 carried it forward).
--
-- RUN AFTER 0190 (this replaces 0190's guard function to cover the new column).
-- Idempotent: safe to run more than once.
--
-- NOTE FOR BYRON: section 5 writes to auth.users (banned_until) and deletes from
-- auth.sessions / auth.refresh_tokens. If the postgres role isn't allowed to do that
-- on this project, those steps log a WARNING instead of failing, and deactivation
-- still works through the app-side block (the app signs out deactivated accounts).
-- Please tell Susanna if you see "could not block sign-in" warnings.

-- ─── 1. New setting: hide from staff lists ──────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hidden_from_lists boolean NOT NULL DEFAULT false;

-- ─── 2. Admin-only guard now also covers hidden_from_lists ───────────
CREATE OR REPLACE FUNCTION guard_profile_access_columns() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role                  IS DISTINCT FROM OLD.role
  OR NEW.department            IS DISTINCT FROM OLD.department
  OR NEW.manager_email         IS DISTINCT FROM OLD.manager_email
  OR NEW.active                IS DISTINCT FROM OLD.active
  OR NEW.email                 IS DISTINCT FROM OLD.email
  OR NEW.lcp_role              IS DISTINCT FROM OLD.lcp_role
  OR NEW.lcp_curriculum_access IS DISTINCT FROM OLD.lcp_curriculum_access
  OR NEW.partnerships_access   IS DISTINCT FROM OLD.partnerships_access
  OR NEW.ops_access            IS DISTINCT FROM OLD.ops_access
  OR NEW.toc_access            IS DISTINCT FROM OLD.toc_access
  OR NEW.stories_access        IS DISTINCT FROM OLD.stories_access
  OR NEW.hidden_from_lists     IS DISTINCT FROM OLD.hidden_from_lists
  THEN
    RAISE EXCEPTION 'Only admins can change role, department, or access settings';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_access_columns ON profiles;
CREATE TRIGGER profiles_guard_access_columns BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_access_columns();

-- ─── 3. Byron: keeps access, hidden from staff lists ────────────────
-- Susanna/Andrew 2026-10-27: Byron is a subcontractor, not staff, so he shouldn't
-- appear in staff lists, but he should be able to sign in when needed.
-- Must run BEFORE section 5's backfill so his account isn't blocked.
UPDATE profiles
SET active = true, hidden_from_lists = true
WHERE lower(trim(email)) = 'it@sparrowinc.org'
  AND (active = false OR hidden_from_lists = false);

-- ─── 4. Sign-in linker: never re-activate a deactivated profile ─────
-- Same as 0069 except a deactivated staff profile is rejected instead of
-- being flipped back to active.
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF new.email IS NULL THEN
    RAISE EXCEPTION 'No email on account';
  END IF;

  -- Staff (Google sign-in, allowlisted by profiles)
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE lower(trim(email)) = lower(trim(new.email)) AND active = false
  ) THEN
    RAISE EXCEPTION 'This Sparrow staff account (%) has been deactivated', new.email;
  END IF;

  UPDATE profiles SET id = new.id
  WHERE lower(trim(email)) = lower(trim(new.email)) AND active = true;
  IF found THEN
    RETURN new;
  END IF;

  -- LifeChange family (email + password, allowlisted by families.login_email)
  UPDATE families SET auth_id = new.id
  WHERE lower(trim(login_email)) = lower(trim(new.email)) AND active = true;
  IF found THEN
    RETURN new;
  END IF;

  RAISE EXCEPTION 'Email % is not on the Sparrow roster (staff or LifeChange family)', new.email;
END $$;

-- ─── 5. Deactivate = block sign-in + end open sessions ──────────────
-- Uses Supabase Auth's own ban (auth.users.banned_until), which stops new sign-ins
-- AND session refreshes, so already-open browsers lose access within the hour
-- (when their current access token expires). Reactivating lifts the ban.
-- One place instead of editing every room's permission check.

CREATE OR REPLACE FUNCTION set_staff_sign_in_blocked(p_user uuid, p_blocked boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_blocked THEN
    UPDATE auth.users SET banned_until = 'infinity' WHERE id = p_user;
    DELETE FROM auth.refresh_tokens WHERE user_id = p_user::text;
    DELETE FROM auth.sessions WHERE user_id = p_user;
  ELSE
    UPDATE auth.users SET banned_until = NULL WHERE id = p_user;
  END IF;
EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_column THEN
  RAISE WARNING 'could not block sign-in for %: %', p_user, SQLERRM;
END $$;

-- Only callable by the triggers below / SQL editor, never from the app.
REVOKE ALL ON FUNCTION set_staff_sign_in_blocked(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Can't deactivate your own account (stops an admin locking themselves out).
CREATE OR REPLACE FUNCTION guard_self_deactivation() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.active AND NOT NEW.active AND auth.uid() IS NOT NULL AND NEW.id = auth.uid() THEN
    RAISE EXCEPTION 'You can''t deactivate your own account';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_self_deactivation ON profiles;
CREATE TRIGGER profiles_guard_self_deactivation BEFORE UPDATE OF active ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_self_deactivation();

CREATE OR REPLACE FUNCTION sync_staff_sign_in_block() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.active IS DISTINCT FROM OLD.active THEN
    PERFORM set_staff_sign_in_blocked(NEW.id, NOT NEW.active);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_sync_sign_in_block ON profiles;
CREATE TRIGGER profiles_sync_sign_in_block AFTER UPDATE OF active ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_staff_sign_in_block();

-- Backfill: block everyone who is already deactivated (as of 2026-10-27:
-- Systems Admin and Ryan; Byron was reactivated in section 3 above).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE active = false LOOP
    PERFORM set_staff_sign_in_blocked(r.id, true);
  END LOOP;
END $$;
