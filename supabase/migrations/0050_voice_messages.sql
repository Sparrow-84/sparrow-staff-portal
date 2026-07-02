-- 0050_voice_messages.sql
-- Adds voice message support to chat: two new columns on chat_messages +
-- a public voice-messages storage bucket with upload policy.
-- No destructive changes. Safe to run in Supabase SQL editor. Run once.

-- ── Schema ────────────────────────────────────────────────────────────
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS voice_url      text,
  ADD COLUMN IF NOT EXISTS voice_duration integer;  -- seconds; NULL for text messages

-- ── Storage bucket ────────────────────────────────────────────────────
-- Public bucket: URLs are non-guessable (channel/user/timestamp paths).
-- 5 MB per file is generous for even a 5-minute voice message.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-messages',
  'voice-messages',
  true,
  5242880,
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can upload voice messages" ON storage.objects;
CREATE POLICY "Authenticated users can upload voice messages"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice-messages');

DROP POLICY IF EXISTS "Public can read voice messages" ON storage.objects;
CREATE POLICY "Public can read voice messages"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'voice-messages');
