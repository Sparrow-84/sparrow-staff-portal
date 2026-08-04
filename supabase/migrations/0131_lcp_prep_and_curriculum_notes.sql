-- Sparrow — LCP: real persistence for Thursday's "scratch notes" (which were
-- explicitly labeled "not saved" and genuinely weren't -- local component
-- state only). Two separate fields:
--
-- prep_notes lives on the day's own log (lcp_session_logs) -- written any
-- time before or during the session, tied to that specific instance. Needs
-- filed_at so a log created early (before filing, so prep notes have
-- somewhere to save) can be told apart from one that's actually been filed --
-- existence alone no longer means "filed" the way it used to for Thursday.
--
-- curriculum_notes lives on the curriculum session itself (lcp_sessions) so
-- the same text surfaces directly in Curriculum Admin next to the real
-- Teacher Guide, not just on tonight's log. curriculum_notes_reviewed_at is
-- cleared back to null every time the text changes, so the "unreviewed"
-- badge reappears if new notes get added after a prior round was reviewed.

alter table lcp_session_logs add column if not exists filed_at timestamptz;
alter table lcp_session_logs add column if not exists prep_notes text;

-- Backfill: under the old model, a row existing meant it was filed. Only
-- touches never-backfilled rows, safe to re-run.
update lcp_session_logs set filed_at = created_at where filed_at is null;

alter table lcp_sessions add column if not exists curriculum_notes text;
alter table lcp_sessions add column if not exists curriculum_notes_reviewed_at timestamptz;
