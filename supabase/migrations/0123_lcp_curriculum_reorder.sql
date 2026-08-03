-- ============================================================
-- 0123_lcp_curriculum_reorder.sql
-- LCP curriculum reorder: Bathroom moves out of "Heart of the Home"
-- into "Rest & Restoration", per Shelly's request (2026-07-30,
-- confirmed final order 2026-08-03): Kids' Bedroom, then Master
-- Bedroom, then Bathroom.
--
-- Renumbering is safe: every FK-based link (lcp_program_position,
-- lcp_events, lcp_homework, lcp_resources, lcp_staff_notes) points at
-- lcp_sessions.id / lcp_units.id, never at session_number or
-- sort_order — confirmed via direct DB check 2026-08-03 that no
-- active family is past session 8 (still in Groundwork), so nothing
-- live depends on today's numbers either.
--
-- All updates are keyed by stable id (units) or by the session's own
-- primary key id (sessions, listed with its title in a comment for
-- auditability) — safe to re-run, a no-op the second time.
-- ============================================================

-- ── 1. Unit reassignment ────────────────────────────────────────────────
-- Bathroom moves from "Heart of the Home" (phase 2) into "Rest & Restoration"
-- (phase 3), landing last in the new Kids' Bedroom -> Master Bedroom ->
-- Bathroom order. Master Bedroom's sort_order (7) does not change — only
-- its meaning does, since Bathroom no longer precedes it in a different
-- phase.
UPDATE lcp_units
   SET phase_id = (SELECT id FROM lcp_phases WHERE number = 3),
       sort_order = 8
 WHERE name = 'Bathroom';

UPDATE lcp_units
   SET sort_order = 6
 WHERE name = 'Kids'' Bedroom';

UPDATE lcp_units
   SET sort_order = 7
 WHERE name = 'Master Bedroom';

-- ── 2. Session renumbering ─────────────────────────────────────────────
-- sort_order is kept mirrored 1:1 with session_number, matching seed_lcp.sql's
-- convention — not currently read for ordering anywhere in the app (sessions
-- are client-sorted by session_number, see fetchPhasesWithUnits() in lib/lcp.ts),
-- but updated here too so the two columns don't silently drift apart.

-- Kids' Bedroom: 29-34 -> 21-26
UPDATE lcp_sessions SET session_number = 21, sort_order = 21 WHERE id = 405; -- Who this child is
UPDATE lcp_sessions SET session_number = 22, sort_order = 22 WHERE id = 406; -- Not the way I was parented
UPDATE lcp_sessions SET session_number = 23, sort_order = 23 WHERE id = 407; -- What your child is absorbing
UPDATE lcp_sessions SET session_number = 24, sort_order = 24 WHERE id = 425; -- Correction that builds
UPDATE lcp_sessions SET session_number = 25, sort_order = 25 WHERE id = 426; -- When children compete
UPDATE lcp_sessions SET session_number = 26, sort_order = 26 WHERE id = 427; -- The hard days

-- Master Bedroom: 24-28 -> 27-31
UPDATE lcp_sessions SET session_number = 27, sort_order = 27 WHERE id = 400; -- He makes me lie down
UPDATE lcp_sessions SET session_number = 28, sort_order = 28 WHERE id = 447; -- The way it was meant to be
UPDATE lcp_sessions SET session_number = 29, sort_order = 29 WHERE id = 402; -- Covenant, purity and moving forward
UPDATE lcp_sessions SET session_number = 30, sort_order = 30 WHERE id = 403; -- Healing from sexual shame
UPDATE lcp_sessions SET session_number = 31, sort_order = 31 WHERE id = 404; -- Go in peace — and give your children something different

-- Bathroom: 21-23 -> 32-34
UPDATE lcp_sessions SET session_number = 32, sort_order = 32 WHERE id = 397; -- The mirror — seeing ourselves clearly
UPDATE lcp_sessions SET session_number = 33, sort_order = 33 WHERE id = 446; -- The wash — confession and cleansing
UPDATE lcp_sessions SET session_number = 34, sort_order = 34 WHERE id = 399; -- Walking out clean

-- ── 3. Whole House review sessions — fix the phase-pair room lists ────
-- Mechanical relisting per Shelly's own new grouping, not new prose.
UPDATE lcp_sessions
   SET mentor_brief = replace(
     mentor_brief,
     $$Foundation, Basement, Front Door, Living Room, Kitchen, and Bathroom.$$,
     $$Foundation, Basement, Front Door, Living Room, and Kitchen.$$
   )
 WHERE session_number = 46;

UPDATE lcp_sessions
   SET mentor_brief = replace(
     mentor_brief,
     $$the Master Bedroom, Kids' Bedroom, Office, and Attic.$$,
     $$the Kids' Bedroom, Master Bedroom, Bathroom, Office, and Attic.$$
   )
 WHERE session_number = 47;
