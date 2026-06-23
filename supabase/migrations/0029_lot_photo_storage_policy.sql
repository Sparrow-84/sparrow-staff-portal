-- Migration 0029: storage RLS policies for lot-photos bucket
-- Allows authenticated staff to upload/replace photos; public read for display.

CREATE POLICY "Authenticated users can upload lot photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lot-photos');

CREATE POLICY "Authenticated users can update lot photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lot-photos');

CREATE POLICY "Public can read lot photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'lot-photos');
