-- 0053_lcp_messages_media.sql
-- Adds voice and image support to lcp_messages, matching chat_messages parity.
-- Requires storage buckets created below.

ALTER TABLE lcp_messages
  ADD COLUMN IF NOT EXISTS voice_url      text,
  ADD COLUMN IF NOT EXISTS voice_duration integer,
  ADD COLUMN IF NOT EXISTS image_url      text;

-- Storage buckets for LCP participant media
INSERT INTO storage.buckets (id, name, public)
  VALUES ('lcp-voice-messages', 'lcp-voice-messages', true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('lcp-images', 'lcp-images', true)
  ON CONFLICT (id) DO NOTHING;

-- Authenticated users (participants + staff) can upload
CREATE POLICY "auth can upload lcp voice" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lcp-voice-messages');

CREATE POLICY "public can read lcp voice" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'lcp-voice-messages');

CREATE POLICY "auth can upload lcp images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lcp-images');

CREATE POLICY "public can read lcp images" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'lcp-images');
