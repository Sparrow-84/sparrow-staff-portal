-- Partnerships room: business-card photos (front + back) for partners and meaningful
-- connections — Andrew's ask, so a card handed over in person doesn't just get lost.
-- Not sensitive per Susanna's call, but still scoped to partnerships-access staff only
-- (not fully public) — a private bucket + signed URLs, same pattern as grant-documents.
-- Two fixed slots, no history: each re-upload overwrites the same path.

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS business_card_front_path text,
  ADD COLUMN IF NOT EXISTS business_card_back_path  text;

ALTER TABLE partnership_connections
  ADD COLUMN IF NOT EXISTS business_card_front_path text,
  ADD COLUMN IF NOT EXISTS business_card_back_path  text;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('partnership-cards', 'partnership-cards', false, 10485760)  -- 10 MB
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Partnerships staff can read business card photos"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'partnership-cards' AND partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Partnerships staff can upload business card photos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'partnership-cards' AND partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Partnerships staff can replace business card photos"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'partnership-cards' AND partnerships_has_access())
    WITH CHECK (bucket_id = 'partnership-cards' AND partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Partnerships staff can delete business card photos"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'partnership-cards' AND partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
