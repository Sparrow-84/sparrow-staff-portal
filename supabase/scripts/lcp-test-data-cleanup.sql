-- LCP test data cleanup — run once, before real participant data goes in.
-- Removes the 4 fake test families (Tester, Tester 2, April May, Marie Wenger)
-- and everything tied to them, plus every "filed session" log. Deliberately
-- does NOT touch: calendar events (Session Cal + Team Cal, both departments'
-- calendar_events rows), or curriculum content (phases/units/sessions/
-- resources) — those are real, keep as-is.
--
-- Byron: run in Supabase → SQL Editor. Run the SELECT preview block first
-- (uncomment it) to confirm the counts match what's below before running
-- the DELETE/UPDATE section. Safe to run more than once (each family/session
-- log is either already gone or isn't).
--
-- ONE MANUAL STEP THIS SCRIPT CANNOT DO: two of the four test families have
-- real Supabase Auth login accounts (Marie Wenger — wengershelly7@gmail.com,
-- and Tester — susanna.basden@gmail.com). Deleting their `families` row
-- below does NOT delete the login itself — that has to be done separately
-- in Supabase Dashboard → Authentication → Users → find each email → delete.
-- Otherwise those two emails stay as valid logins pointing at nothing.

-- ── Preview (run first, confirm before continuing) ─────────────────────
-- SELECT id, display_name, login_email, auth_id FROM families;
-- SELECT count(*) FROM lcp_session_logs;
-- SELECT unit_id, session_id FROM lcp_program_position WHERE id = 1;

BEGIN;

-- Step 1: delete the 4 test families. Cascades automatically (verified
-- against the live schema, all ON DELETE CASCADE) to: lcp_attendance,
-- lcp_homework, lcp_redemptions, lcp_vouchers, lcp_messages,
-- lcp_staff_notes, lcp_session_attendance, lcp_resource_completions,
-- lcp_family_milestone_progress, lcp_goals, lcp_goal_responses,
-- lcp_message_reactions, lcp_household_adults, lcp_household_children,
-- lcp_program_fee_payments, lcp_toc_move_in_requests,
-- lcp_housing_savings_months, lcp_compliance_notes.
DELETE FROM families
WHERE display_name IN ('Tester', 'Tester 2', 'April May', 'Marie Wenger');

-- Step 2: delete every filed/draft session log (Monday Mentoring, Thursday
-- Group, ad-hoc) — all of it is test-era. Cascades to lcp_session_attendance
-- (any rows not already gone from step 1) and lcp_monday_bucket_status.
-- Calendar events themselves are untouched — no FK ties a calendar_events or
-- lcp_events row to lcp_session_logs, and there's no trigger blocking this.
DELETE FROM lcp_session_logs;

-- Step 3: clear staff testing annotations left on curriculum sessions
-- (Shelly's actual Teacher Guide/devotional content is untouched — this is
-- only the separate curriculum_notes field staff used while reviewing).
UPDATE lcp_sessions
SET curriculum_notes = NULL, curriculum_notes_reviewed_at = NULL
WHERE curriculum_notes IS NOT NULL;

-- Step 4: reset the group's shared curriculum position to match where the
-- REAL group actually is (confirmed directly with Shelly 2026-08-06, not
-- inferred from test data) -- tonight's real session is session_number 14,
-- "The signs you are in something unhealthy" (Living Room unit, 4th
-- session). Setting session_id to session_number 13 (id 389, same unit)
-- makes session_number 14 (id 390) the correct "next one up."
UPDATE lcp_program_position
SET unit_id = 4, session_id = 389, updated_at = now(), updated_by = NULL
WHERE id = 1;

-- Step 5: clear materials-prep checkboxes from testing (harmless no-op if
-- already empty).
DELETE FROM lcp_materials_prep_status;

COMMIT;

-- To verify after running:
-- SELECT count(*) FROM families;                              -- expect 0
-- SELECT count(*) FROM lcp_session_logs;                       -- expect 0
-- SELECT count(*) FROM lcp_goals, lcp_homework, lcp_vouchers;  -- expect 0 each
-- SELECT unit_id, session_id FROM lcp_program_position WHERE id = 1;
--   -- expect unit_id=4, session_id=389
-- SELECT count(*) FROM lcp_sessions;                           -- expect 48 (unchanged)
-- SELECT count(*) FROM lcp_events;                             -- expect 108 (unchanged)
