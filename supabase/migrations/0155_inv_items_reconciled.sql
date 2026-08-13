-- ============================================================
-- 0155_inv_items_reconciled.sql
-- Adds a "Reconciled" checkbox to inv_items — tracks whether Susanna
-- has personally checked a given register line against her original
-- spreadsheet during the 2026 line-by-line accuracy pass. Deliberately
-- separate from review_flag: review_flag means "something about this
-- item is unresolved, look at it again later"; reconciled just means
-- "I've verified this specific line," independent of whether it has
-- open questions or filing corrections pending.
--
-- has_ops_access() gate matches has_ops_access() used elsewhere (0139)
-- so this also works from the pg_cron/service context if ever needed —
-- not required today, just the standing convention for SECURITY DEFINER
-- functions that mutate register data.
-- ============================================================

ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS reconciled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION inv_clear_all_reconciled() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_ops_access() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE inv_items SET reconciled = false WHERE reconciled = true;
END $$;
