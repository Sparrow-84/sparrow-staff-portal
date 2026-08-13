-- ============================================================
-- 0156_inv_mark_filed_include_not_filed.sql
-- Fixes inv_mark_filed(): it only ever flipped 'added'/'updated' items
-- to 'carried_over', leaving 'not_filed' items stuck showing "Not
-- Filed" forever even after they'd genuinely been reported to the
-- county. The Filing tab's own summary already treats "Not Filed"
-- as part of the same "needs action this year" bucket as
-- "New"/"Updated" (see needsAction in FilingView.tsx) — this brings
-- the actual mark-as-filed behavior in line with that, so it was a
-- real gap, not a deliberate design choice.
--
-- CREATE OR REPLACE — this only changes what happens the NEXT time
-- "Mark as Filed" is clicked. Nothing about any existing item's
-- filing_status, review_flag, notes, or reconciled value changes.
-- ============================================================

CREATE OR REPLACE FUNCTION inv_mark_filed(p_year smallint)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT inv_has_ops_access() THEN
    RAISE EXCEPTION 'Insufficient permissions — ops access required';
  END IF;

  UPDATE inv_items
    SET filing_status = 'carried_over', updated_at = now()
    WHERE status = 'active'
      AND filing_status IN ('added', 'updated', 'not_filed');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO inv_filings (year, filed_by, filed_at)
    VALUES (p_year, auth.uid(), now())
    ON CONFLICT (year)
    DO UPDATE SET filed_by = EXCLUDED.filed_by, filed_at = EXCLUDED.filed_at;

  RETURN v_count;
END;
$$;
