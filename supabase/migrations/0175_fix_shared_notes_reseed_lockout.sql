-- Fixes a real bug caused by 0173 and 0174 interacting: 0173's own backfill marked
-- any row with a non-null (but actually corrupted, per 0172's bytea bug) yjs_state
-- as legacy_seeded = true. 0174 then correctly wiped every yjs_state back to null
-- (that data was unreadable garbage) but had no reason to touch legacy_seeded.
--
-- The combination silently locked those rows out of ever reloading their real
-- content: the app sees legacy_seeded = true (already seeded, don't reseed) AND
-- yjs_state IS NULL (nothing to load) at the same time -- so the Shared Notes
-- pane renders fully empty even though the actual text is completely intact in
-- the plain `notes` column, untouched by either bug.
--
-- Re-opens exactly those rows (real legacy text present, nothing in the
-- collaborative doc) for the app's existing seed-once-atomically logic to pick
-- back up correctly on next load.
update event_shared_notes
set legacy_seeded = false
where yjs_state is null
  and notes is not null
  and length(trim(notes)) > 0;
