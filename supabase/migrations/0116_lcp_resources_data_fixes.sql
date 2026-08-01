-- Two pre-existing lcp_resources data problems found during the Basement curriculum
-- pilot planning (2026-07-31), unrelated to any new feature:
--
-- 1. Foundation Session 1's teacher_guide row was entered (by Shelly, testing the
--    old Drive-link-only flow) as audience='participant'. Teacher guides are internal
--    facilitation notes (leader scripts, sensitive-content handling) and must never be
--    participant-visible, per lcp_resources' own read policy intent.
--
-- 2. The Basement "Day 18" devotional ("You don't have to understand it. You just have
--    to say yes.") exists as two exact-duplicate rows, both with session_id = null.
--    Root cause (already diagnosed 2026-07-02): the original insert looked up the
--    Basement session by session_number, which didn't exist yet, so session_id came
--    back null both times it was attempted. Basement's session rows still don't exist
--    (migration 0086 hasn't run) — this migration only dedupes; a follow-up update will
--    attach the surviving row to its real session once 0086 lands.

update lcp_resources
set audience = 'staff'
where kind = 'teacher_guide' and audience = 'participant';

delete from lcp_resources
where id = '73e929cd-3577-4cc7-8eaf-eadccc042818'
  and kind = 'devotional'
  and session_id is null
  and title = 'You don''t have to understand it. You just have to say yes.';
