-- 0228: Ops users can log inventory on any location's monthly sheet, and
-- every addition/removal records who entered it.
--
-- Bug (2026-11-14): Andrew (ops_access = true) tried to add an item to Office
-- Building and got "new row violates row-level security policy for table
-- inv_monthly_submissions". Opening a location's sheet creates that month's
-- submission if none exists yet. The only INSERT policy required
-- inv_can_submit(location_id), meaning the user had to be assigned to that
-- location. Ops already has full access to additions, removals and comments,
-- and can read and update any submission. INSERT was the only missing piece.
--
-- Decision (Susanna, 2026-11-14): ops users (Susanna, Andrew) can put items on
-- any location's list, but only the designated submitter submits. So the
-- submitter can see who entered each line and when, and not double-enter it,
-- additions and removals now record created_by (filled automatically).
-- Rows entered before this migration stay NULL ("who" unknown).
--
-- Idempotent: safe to run more than once.

-- 1. Ops can create a submission for any location.
DROP POLICY IF EXISTS "inv: ops creates any submission" ON inv_monthly_submissions;

CREATE POLICY "inv: ops creates any submission"
  ON inv_monthly_submissions FOR INSERT
  WITH CHECK (inv_has_ops_access());

-- 2. Record who entered each addition and removal.
ALTER TABLE inv_additions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) DEFAULT auth.uid();

ALTER TABLE inv_removals
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) DEFAULT auth.uid();

-- 3. Record who last edited a line and when ("Edited by Raymond · Nov 15").
-- Set by the app only when a person saves an edit. Deliberately NOT a
-- trigger: the approval function also updates these rows (inv_item_id),
-- and that must not show up as an edit by the approver.
ALTER TABLE inv_additions
  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

ALTER TABLE inv_removals
  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;
