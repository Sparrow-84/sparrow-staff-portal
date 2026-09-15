-- Sparrow — LCP: pin a curriculum session to each Thursday Group log row.
--
-- Context: "tonight's session" was always computed LIVE from
-- lcp_program_position (whatever comes right after the current pointer),
-- recomputed fresh every time anyone looked at it -- both when a Thursday
-- draft is open and when Monday Mentoring shows "what the group covered."
-- That's fragile: if the pointer moves for any reason while a Thursday
-- draft sits unfiled (a manual correction, or just time passing), the
-- draft's own idea of what it's about silently drifts. Real incident
-- 2026-09-14/15: a Thursday session sat unfiled for a bit, Monday Mentoring
-- showed a stale session as a result, and there was no way to just say
-- "actually, we're on this one" without it drifting again later.
--
-- Fix: lcp_session_logs now carries its own session_id, stamped once when
-- the draft is first created (from whatever "next session" looked like at
-- that moment) and editable afterward via a small in-place picker ("Fix
-- it" in SessionLogEntry) -- independent of wherever lcp_program_position
-- currently points. Filing/advancing then reads THIS pinned value, not a
-- freshly-recomputed one.
--
-- Existing rows (filed or not) are left NULL -- there's no reliable way to
-- backfill "what was actually taught" for historical logs, and nothing
-- reads this column for anything but new Thursday Group entries going
-- forward.
--
-- Depends on: 0005_lcp.sql (lcp_session_logs, lcp_sessions).
-- Safe to re-run: ADD COLUMN uses IF NOT EXISTS.

ALTER TABLE lcp_session_logs
  ADD COLUMN IF NOT EXISTS session_id integer REFERENCES lcp_sessions(id) ON DELETE SET NULL;
