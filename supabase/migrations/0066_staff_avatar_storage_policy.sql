-- Migration 0066: storage RLS policies for staff-avatars bucket
-- Allows authenticated staff to upload/replace their own avatar photo; public read for display.
-- NOTE: the 'staff-avatars' bucket itself must be created in Supabase Storage (public) before this runs.

CREATE POLICY "Authenticated users can upload staff avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-avatars');

CREATE POLICY "Authenticated users can update staff avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'staff-avatars');

CREATE POLICY "Public can read staff avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'staff-avatars');
