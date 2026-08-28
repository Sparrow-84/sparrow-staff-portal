-- Fixes duplicate text in Shared Notes: when a pre-Yjs note was opened by several
-- people at nearly the same moment, each client independently saw an empty
-- collaborative doc plus the old plain-text note and locally inserted it as a fresh
-- edit — the CRDT kept every one of those separate insertions, so the same line
-- showed up once per person who happened to load it in that window.
-- legacy_seeded lets the client claim the one-time seed atomically (an UPDATE ...
-- WHERE legacy_seeded = false that only one concurrent request can win), so only
-- the first opener ever inserts the legacy text.
alter table event_shared_notes
  add column if not exists legacy_seeded boolean not null default false;

-- Rows that already have a Yjs doc were seeded (or never needed seeding) —
-- mark them claimed so they're never re-seeded.
update event_shared_notes set legacy_seeded = true where yjs_state is not null;
