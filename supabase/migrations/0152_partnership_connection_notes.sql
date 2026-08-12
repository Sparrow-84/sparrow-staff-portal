-- Migration 0152: Meaningful Connections -- log more than one interaction.
--
-- Bethany's real ask (clarified 2026-08-11) wasn't a cadenced touchpoint system
-- like partners have -- a connection has no cadence to measure against, it's a
-- pre-decision lead. She just needs to log a second (third, etc.) conversation
-- with someone like Kotan Bani without cramming it into the single
-- "what_discussed" field. This is a plain dated note log, nothing more.

CREATE TABLE IF NOT EXISTS partnership_connection_notes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid        NOT NULL REFERENCES partnership_connections(id) ON DELETE CASCADE,
  occurred_on   date        NOT NULL,
  note          text        NOT NULL,
  logged_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partnership_connection_notes_conn_idx ON partnership_connection_notes(connection_id);

ALTER TABLE partnership_connection_notes ENABLE ROW LEVEL SECURITY;

-- Same access convention as partnership_connections itself (0038).
DO $$ BEGIN
  CREATE POLICY partnership_connection_notes_all ON partnership_connection_notes
    FOR ALL TO authenticated
    USING (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
