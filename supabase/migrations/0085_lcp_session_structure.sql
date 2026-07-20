-- Sparrow — LCP: split each session into its three weekly tracks (Monday Mentoring,
-- Thursday Group, Participant Devotionals) and track program position at the session
-- level, not just the unit level.
-- Depends on: 0005_lcp.sql (lcp_sessions), 0034_lcp_program_position.sql
-- Safe to re-run: column adds are guarded with IF NOT EXISTS.

-- ─── Monday Mentoring content (per session) ───────────────────────────────────
-- Mirrors the structure of Shelly's Mentor Conversation Guide: a brief for the
-- mentor, the handout questions echoed back for natural follow-up, and optional
-- Going Deeper questions for when the participant is ready to go further.
ALTER TABLE lcp_sessions ADD COLUMN IF NOT EXISTS mentor_brief         text;
ALTER TABLE lcp_sessions ADD COLUMN IF NOT EXISTS mentor_handout_echo  text;
ALTER TABLE lcp_sessions ADD COLUMN IF NOT EXISTS mentor_going_deeper  text;

-- ─── Program position: track the specific session, not just the unit ─────────
-- Previously only unit_id was tracked, but units span ~4 sessions each — there
-- was no record of which of those sessions the group is actually on. This is
-- what lets Monday Mentoring correctly show "the session the group most recently
-- attended" instead of guessing.
ALTER TABLE lcp_program_position
  ADD COLUMN IF NOT EXISTS session_id int REFERENCES lcp_sessions(id) ON DELETE SET NULL;
