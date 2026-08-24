-- 0169_event_external_invites.sql
-- "Invite someone outside Sparrow" feature (Design Session E, part 1). Sending the actual
-- email happens in a new edge function (send-external-invite) using domain-wide-delegated
-- Gmail sending -- pending Byron setting that up on the Workspace side. This migration is
-- just the record-keeping: who got invited to what, and when, so there's a visible trail
-- even though replies/RSVPs land in the inviter's own inbox, not back in Sparrow.
--
-- Deliberately no update/delete policy -- once sent, an invite record is a fact, not
-- something to edit away. The "external guest invited" indicator on an event is just
-- computed from whether any rows exist here for that event, not a separate flag to
-- keep in sync.

CREATE TABLE IF NOT EXISTS event_external_invites (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  invited_email text       NOT NULL,
  note         text,
  invited_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_external_invites ENABLE ROW LEVEL SECURITY;

-- Read: anyone authenticated (same visibility bar as calendar_events itself -- knowing
-- "an outside guest was invited to this meeting" isn't sensitive within the org).
DO $$ BEGIN
  CREATE POLICY event_external_invites_select ON event_external_invites
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Insert: only whoever could edit the event in the first place (creator or admin) --
-- mirrors calendar_events' own edit-permission convention (see OrgEventDetailPanel).
DO $$ BEGIN
  CREATE POLICY event_external_invites_insert ON event_external_invites
    FOR INSERT TO authenticated WITH CHECK (
      invited_by = auth.uid()
      AND exists (
        select 1 from calendar_events ce
        where ce.id = event_id
          and (ce.created_by = auth.uid() or exists (
            select 1 from profiles where id = auth.uid() and role = 'admin'
          ))
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
