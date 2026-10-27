-- 0190_profiles_guard_access_columns.sql
-- Security fix: profiles_update_self (0001) lets every staff member update their
-- OWN profile row, with no limit on which columns. Through the API (not the app UI)
-- anyone could set their own role = 'admin', grant themselves room access, or
-- reactivate / re-email their account.
--
-- This trigger blocks non-admins from changing the role, access, and roster columns.
-- Self-service fields (blurb, birthday, work schedule, push/dark-mode settings,
-- Google Calendar sync fields, etc.) are unaffected.
--
-- Allowed through unchanged:
--   • admins (is_admin()) — the Staff admin panel
--   • anything with no signed-in user (auth.uid() IS NULL): the sign-in linker
--     (handle_new_user), migrations, and SQL run by Byron in the dashboard
--
-- sop_admin_rooms already has its own guard from 0189.
-- Idempotent: safe to run more than once.

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
  THEN
    RAISE EXCEPTION 'Only admins can change role, department, or access settings';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_access_columns ON profiles;
CREATE TRIGGER profiles_guard_access_columns BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_access_columns();
