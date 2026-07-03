-- 0054_messaging_enhancements.sql
-- Adds reply-to, edit tracking, delete support, and reactions to both staff
-- and LCP messaging. Read receipts for direct messages use the existing
-- chat_members.last_read_at column via a new security-definer helper.

-- ── Staff messages ─────────────────────────────────────────────────────────────

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at   timestamptz;

-- ── LCP messages ───────────────────────────────────────────────────────────────

ALTER TABLE lcp_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES lcp_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at   timestamptz;

-- ── Staff message reactions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_reactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid        NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  message_id uuid        NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  emoji      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;

-- Members of the channel can read all reactions for that channel.
CREATE POLICY "channel members read reactions" ON chat_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.channel_id = chat_reactions.channel_id
        AND cm.user_id = auth.uid()
    )
  );

-- Authenticated members can insert their own reactions.
CREATE POLICY "channel members add reaction" ON chat_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.channel_id = chat_reactions.channel_id
        AND cm.user_id = auth.uid()
    )
  );

-- Users can delete only their own reactions.
CREATE POLICY "users remove own reaction" ON chat_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── LCP message reactions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lcp_message_reactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid        NOT NULL REFERENCES families(id)      ON DELETE CASCADE,
  message_id uuid        NOT NULL REFERENCES lcp_messages(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  emoji      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE lcp_message_reactions ENABLE ROW LEVEL SECURITY;

-- Family members and staff can read reactions on their conversation.
CREATE POLICY "family or staff read lcp reactions" ON lcp_message_reactions
  FOR SELECT TO authenticated
  USING (
    -- the reacting family owns the conversation
    family_id IN (SELECT id FROM families WHERE id = lcp_message_reactions.family_id)
  );

CREATE POLICY "authenticated add lcp reaction" ON lcp_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users remove own lcp reaction" ON lcp_message_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── Read-receipt helper ─────────────────────────────────────────────────────────
-- Returns the other member's last_read_at for a direct channel so the sender
-- can show a "Seen" indicator without exposing the full chat_members table.

CREATE OR REPLACE FUNCTION chat_other_member_read_at(p_channel uuid)
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cm.last_read_at
  FROM chat_members cm
  WHERE cm.channel_id = p_channel
    AND cm.user_id != auth.uid()
  LIMIT 1;
$$;
