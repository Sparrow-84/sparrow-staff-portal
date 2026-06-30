-- ============================================================
-- 0044_donations.sql
-- Donation history table + Givebutter webhook support.
-- Also adds a unique constraint to partnership_comms to prevent
-- duplicate entries caused by a race condition in the seed function.
--
-- Donation design notes:
--   • amount_above_10k (bool) is stored instead of the exact dollar amount.
--     Andrew's policy: staff should not know exact amounts so it doesn't
--     change how they interact with donors. The Givebutter Edge Function
--     converts the raw amount to this flag before inserting.
--   • givebutter_id is the Givebutter transaction ID — used to deduplicate
--     webhook retries (Edge Function does an upsert on this field).
--   • partner_id is nullable: not every donor is in the CRM yet at time of
--     first gift. The Edge Function matches by email where possible.
-- ============================================================

-- ── donations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS donations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       uuid        REFERENCES partners(id) ON DELETE SET NULL,
  given_by_name    text,
  given_by_email   text,
  amount_above_10k boolean     NOT NULL DEFAULT false,
  designation      text,
  giving_method    text,
  recurring        boolean     NOT NULL DEFAULT false,
  givebutter_id    text        UNIQUE,
  received_on      date        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS donations_partner_idx  ON donations(partner_id);
CREATE INDEX IF NOT EXISTS donations_email_idx    ON donations(given_by_email);
CREATE INDEX IF NOT EXISTS donations_received_idx ON donations(received_on DESC);

ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

-- Partnerships staff can read donations (to see who gave + designation).
-- No staff can see exact amounts — those are not stored.
DO $$ BEGIN
  CREATE POLICY donations_staff_read ON donations
    FOR SELECT TO authenticated
    USING (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Only the service role (Edge Function / Byron) can insert/update donations.
-- Staff never write to this table directly.
DO $$ BEGIN
  CREATE POLICY donations_service_write ON donations
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── partnership_comms: unique constraint ──────────────────────────────────
-- Prevents duplicate comms entries caused by a race condition in the seed
-- function (two mounts both checked count=0 before either insert completed).
--
-- Byron: before running this, delete existing duplicates:
--   DELETE FROM partnership_comms
--   WHERE id NOT IN (
--     SELECT DISTINCT ON (year, comm_type, title) id
--     FROM partnership_comms
--     ORDER BY year, comm_type, title, created_at ASC
--   );
-- Then this constraint will apply cleanly.

ALTER TABLE partnership_comms
  ADD CONSTRAINT IF NOT EXISTS partnership_comms_year_type_title_key
  UNIQUE (year, comm_type, title);
