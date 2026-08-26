-- Live collaborative editing for shared meeting notes (event_shared_notes).
-- yjs_state holds the encoded Yjs CRDT document — the source of truth for collaborative
-- editing continuity (who-typed-what-when merges correctly with no conflicts).
-- `notes` (existing html column) is kept in sync as a plain rendering for previews/listing
-- (notesHub.ts) that don't need to load the Yjs runtime just to show a snippet.
alter table event_shared_notes
  add column if not exists yjs_state bytea;
