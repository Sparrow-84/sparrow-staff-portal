-- ============================================================
-- 0105_inv_batch_tallies_location.sql
--
-- Two changes:
--
-- 1. Redesign inv_batch_tallies to track per-location tallies.
--    The old table (0017) had no location_id — all 10 categories
--    were global aggregates. The new design is one row per
--    (location, category, year). Rows are created lazily (when a
--    batch item is first approved for that location+category) —
--    no pre-seeding. The table was returning 404 / had no data,
--    so dropping and recreating is safe.
--
-- 2. Restore the "Books Inspirational" item that was incorrectly
--    skipped during the 0083 data import. It was filed with
--    Benton County last year under Schedule 4. The county still
--    has it on file — it needs to be visible in the filing tab
--    so Susanna knows to remove it at the next filing. The books
--    themselves are covered under Misc Books batch (5A).
--    Idempotent: INSERT ... WHERE NOT EXISTS.
-- ============================================================


-- ── 1. Batch tallies redesign ─────────────────────────────────────────────

DROP TABLE IF EXISTS inv_batch_tallies;

CREATE TABLE inv_batch_tallies (
  id          uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid                NOT NULL REFERENCES inv_locations(id) ON DELETE CASCADE,
  category    text                NOT NULL,
  year        smallint            NOT NULL,
  schedule    inv_benton_schedule NOT NULL DEFAULT 'schedule_5a',
  filed_value numeric(10,2),
  decision    text                CHECK (decision IN ('keep', 'update', 'assess')),
  notes       text,
  updated_at  timestamptz         NOT NULL DEFAULT now(),
  updated_by  uuid                REFERENCES profiles(id),
  UNIQUE (location_id, category, year)
);

ALTER TABLE inv_batch_tallies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv: ops manages batch tallies"
  ON inv_batch_tallies FOR ALL USING (inv_has_ops_access());


-- ── 2. Restore Books Inspirational (Schedule 4 misfile) ──────────────────

INSERT INTO inv_items (
  location_id, description, is_batch, condition, is_donated,
  quantity, unit_cost, cost_source, status,
  benton_schedule, filing_status, filed_as, review_flag, notes
)
SELECT
  l.id,
  'Books Inspirational',
  false, 'used', false,
  1, 0, 'estimated', 'active',
  'schedule_4', 'carried_over',
  'Books Inspirational',
  'MISFILED — ACTION REQUIRED: These books were reported to Benton County last year under Schedule 4 (professional library). Schedule 4 does not apply to Sparrow. In January, delete this Schedule 4 line from the county filing portal. Sparrow''s books are covered under the Misc Books batch category (5A). Once removed from the county filing, delete this item from the register.',
  'Filed last year under Schedule 4 in error. Books belong in Misc Books batch (5A). Unit cost is unknown — check last year''s Benton County filing for the Schedule 4 dollar amount and enter it here.'
FROM inv_locations l
WHERE l.name = 'Office Building'
AND NOT EXISTS (
  SELECT 1 FROM inv_items
  WHERE benton_schedule = 'schedule_4'
  AND description = 'Books Inspirational'
);
