-- Fixes the root cause of Shared Notes panes hanging on "Loading": yjs_state was
-- mistakenly created as `bytea` in 0172 (its own comment says "text" -- a base64
-- string -- but the SQL said bytea). The app always writes/reads a base64 TEXT
-- string. Postgres's bytea input parser treats a non-"\x"-prefixed string as raw
-- literal bytes rather than decoding it as base64, so every real save silently
-- stored garbage; reading it back then throws trying to base64-decode it, which
-- left the editor stuck before it ever reached "ready".
--
-- The existing bytea values are unrecoverable garbage from this bug (not real
-- content -- the actual note text was never lost, it's safe in the `notes` plain
-- html column, which this bug never touched). Wiping them to null just means the
-- collaborative doc gets reseeded fresh from that intact `notes` content next time
-- each note is opened, under the app's existing seed-on-empty-doc logic.
alter table event_shared_notes
  alter column yjs_state type text using null;
