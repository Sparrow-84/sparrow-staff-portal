-- ============================================================
-- 0161_inv_location_assignments_write_policy.sql
-- inv_location_assignments has had RLS enabled since 0014 with only a
-- SELECT policy ("inv: all staff read assignments") — no INSERT/UPDATE/
-- DELETE policy was ever added. The Ops Submissions "manage assignees"
-- UI (add person / remove person / set designated submitter) has been
-- silently non-functional the whole time:
--   - Add person: INSERT rejected outright by RLS (no policy = no rows
--     allowed through), but the UI never surfaces the error.
--   - Set owner / remove: UPDATE/DELETE with no matching policy affects
--     zero rows — no error is raised, so the client's own optimistic
--     state update makes it *look* like it worked until the next reload.
-- ============================================================

DROP POLICY IF EXISTS "inv: ops manages location assignments" ON inv_location_assignments;
CREATE POLICY "inv: ops manages location assignments"
  ON inv_location_assignments FOR ALL TO authenticated
  USING (inv_has_ops_access())
  WITH CHECK (inv_has_ops_access());
