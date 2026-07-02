-- 0051_image_messages.sql
-- Adds image_url to chat_messages, creates chat-images storage bucket,
-- and updates chat_list_conversations() to return last_attachment_kind
-- so the conversation preview can distinguish Photo vs Voice message.
-- No destructive changes. Safe to run in Supabase SQL editor. Run once.
-- Run after 0050 (which adds voice_url / voice_duration).

-- ── Schema ────────────────────────────────────────────────────────────
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS image_url text;

-- ── Storage bucket ────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-images',
  'chat-images',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can upload chat images" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "Public can read chat images" ON storage.objects;
CREATE POLICY "Public can read chat images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'chat-images');

-- ── Updated conversation list RPC ─────────────────────────────────────
-- Adds last_attachment_kind ('voice' | 'image' | null) so the preview
-- row in the conversation list can show the right label.
CREATE OR REPLACE FUNCTION chat_list_conversations()
RETURNS TABLE (
  channel_id           uuid,
  kind                 chat_channel_kind,
  title                text,
  last_message_at      timestamptz,
  last_body            text,
  last_author_id       uuid,
  unread               int,
  other_id             uuid,
  other_name           text,
  last_attachment_kind text
)
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    c.id,
    c.kind,
    c.title,
    c.last_message_at,
    lm.body,
    lm.author_id,
    COALESCE((
      SELECT count(*) FROM chat_messages msg
      WHERE msg.channel_id = c.id
        AND msg.created_at > me.last_read_at
        AND msg.author_id <> auth.uid()
    ), 0)::int AS unread,
    other.user_id,
    op.full_name,
    CASE
      WHEN lm.voice_url IS NOT NULL THEN 'voice'
      WHEN lm.image_url IS NOT NULL THEN 'image'
      ELSE NULL
    END AS last_attachment_kind
  FROM chat_members me
  JOIN chat_channels c ON c.id = me.channel_id
  LEFT JOIN LATERAL (
    SELECT body, author_id, voice_url, image_url
    FROM chat_messages msg
    WHERE msg.channel_id = c.id
    ORDER BY msg.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT m2.user_id FROM chat_members m2
    WHERE m2.channel_id = c.id AND m2.user_id <> auth.uid()
    LIMIT 1
  ) other ON c.kind = 'direct'
  LEFT JOIN profiles op ON op.id = other.user_id
  WHERE me.user_id = auth.uid()
  ORDER BY c.last_message_at DESC;
$$;
