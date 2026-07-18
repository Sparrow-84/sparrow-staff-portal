-- 0078_grants.sql
-- Grant Tracking module (Operations room, 4th tab). Susanna's domain — separate from
-- Partnerships/CRM, which tracks donor & partner relationships, not grant compliance.
--
-- Sparrow's grants carry long-tail compliance obligations (affordability periods running
-- decades out, annual OHCS certifications, funder-notification requirements). This gives
-- one record per active grant, an append-only log of funder notifications actually sent,
-- and document attachments — so none of that is tracked only in someone's head or inbox.
--
-- Access: ops tier only (has_ops_access(): Andrew, Susanna, Shelly) — same gate as the
-- rest of Operations (see 0012_operations.sql). Idempotent: safe to run more than once.

-- ─── Enums ───────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE grant_notification_category AS ENUM (
    'insurance_change',
    'management_change',
    'ownership_transfer',
    'debt'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Grants (one record per active grant) ───────────────────────────
CREATE TABLE IF NOT EXISTS grants (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  funder_name              text        NOT NULL,
  amount                   numeric(12,2),
  placed_in_service_date   date,
  affordability_period_end date,
  ohcs_contact_name        text,
  ohcs_contact_email       text,
  ohcs_contact_phone       text,
  certification_due_date   date,                        -- next annual OHCS certification due
  last_certified_on        date,                         -- most recent certification completed
  prior_consent_required   boolean     NOT NULL DEFAULT false,  -- staff must get OHCS/funder consent before acting
  notes                    text,
  created_by               uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TRIGGER set_grants_updated_at
    BEFORE UPDATE ON grants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Notification event log (append-only — a record of funder notices actually sent) ──
CREATE TABLE IF NOT EXISTS grant_notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id   uuid        NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  category   grant_notification_category NOT NULL,
  sent_on    date        NOT NULL DEFAULT current_date,
  notes      text,
  created_by uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_notifications_grant_idx ON grant_notifications(grant_id, sent_on DESC);

-- ─── Document attachments (grant agreement, correspondence) ─────────
-- Metadata row per file; the file itself lives in the private 'grant-documents' storage
-- bucket (see below) — mirrors the housing.ts / chat.ts upload pattern, not a Drive-link.
CREATE TABLE IF NOT EXISTS grant_documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id     uuid        NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  label        text        NOT NULL,
  storage_path text        NOT NULL,
  created_by   uuid        REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_documents_grant_idx ON grant_documents(grant_id);

-- ─── Row-Level Security ──────────────────────────────────────────────
ALTER TABLE grants               ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_documents      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY grants_all ON grants FOR ALL TO authenticated
    USING (has_ops_access()) WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Notifications are append-only: ops tier may read + add entries, never edit/delete history.
DO $$ BEGIN
  CREATE POLICY grant_notifications_read ON grant_notifications FOR SELECT TO authenticated
    USING (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY grant_notifications_insert ON grant_notifications FOR INSERT TO authenticated
    WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY grant_documents_all ON grant_documents FOR ALL TO authenticated
    USING (has_ops_access()) WITH CHECK (has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Storage bucket (private — grant agreements/correspondence, not for public read) ──
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('grant-documents', 'grant-documents', false, 20971520)  -- 20 MB
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Ops tier can read grant documents"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'grant-documents' AND has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Ops tier can upload grant documents"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'grant-documents' AND has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Ops tier can delete grant documents"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'grant-documents' AND has_ops_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
