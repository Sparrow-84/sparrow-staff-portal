-- ============================================================
-- 0115_partnerships_touchpoint_due_and_first_gift.sql
--
-- Two real bugs found testing the Givebutter sync end-to-end with a new
-- donor ("Jane Doe" test, 2026-07-31):
--
-- 1. emit_due_touchpoint_tasks() computed a never-touched partner's due date
--    as (created_at + cadence_days) — i.e. a brand-new, never-contacted
--    donor got a due date 6 months out (Susanna saw "due Jan 29" for a
--    partner whose last touch shows as "never"). That's backwards: someone
--    who's NEVER been touched should read as due NOW, not "the clock just
--    started." Fixed so a NULL last_touchpoint_at means due = today, full
--    stop — no grace period. This also means an untouched donor now
--    naturally surfaces on the Partnerships Home tab (which mirrors this
--    same due-date logic client-side in partnerships-home.ts, updated in
--    the same commit) without needing a separate "new donor" feed.
--
-- 2. first_gift_date on partners was a purely manual field — nothing ever
--    wrote it from an actual donation, so it sat blank even directly below
--    a Giving History entry showing a real gift. Fixed by having
--    attach_gift_to_partner() and create_donor_partner_from_gift() accept
--    the gift's date and backfill first_gift_date only when it's not
--    already set (so a manually-entered date for a cash/check donor is
--    never overwritten). Threaded through resolve_donation_link() and
--    resolve_donation_new_partner() too, so the human-review paths get the
--    same backfill as the automatic paths.
-- ============================================================

-- ── 1. Never-touched partner is due today, not created_at + cadence_days ──
CREATE OR REPLACE FUNCTION emit_due_touchpoint_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; due date;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT id, name, owner_id,
           COALESCE(last_touchpoint_at + cadence_days, current_date) AS due_date
    FROM partners
    WHERE active
      AND stage IN ('active', 'prospect')
      AND owner_id IS NOT NULL
      AND (last_touchpoint_at IS NULL
           OR (last_touchpoint_at + cadence_days) - lead_time_days <= current_date)
  LOOP
    due := r.due_date;
    PERFORM emit_system_task(
      'crm', 'touchpoint:' || r.id, r.owner_id,
      'Touchpoint due — ' || r.name,
      'partnerships'::department, 'p2'::priority, due
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ── 2. Backfill first_gift_date from a real gift, only when not already set ──
CREATE OR REPLACE FUNCTION attach_gift_to_partner(
  p_partner_id       uuid,
  p_amount_above_10k boolean,
  p_gift_date        date DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_amount_above_10k THEN
    UPDATE partners SET donor_tier = 'major'
     WHERE id = p_partner_id AND donor_tier IS DISTINCT FROM 'major';
  END IF;

  IF p_gift_date IS NOT NULL THEN
    UPDATE partners SET first_gift_date = p_gift_date
     WHERE id = p_partner_id AND first_gift_date IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION create_donor_partner_from_gift(
  p_name             text,
  p_email            text,
  p_amount_above_10k boolean,
  p_source           text DEFAULT 'Givebutter',
  p_gift_date        date DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_id  uuid;
  owner   uuid := default_partnerships_owner();
BEGIN
  INSERT INTO partners (
    name, type, stage, owner_id, email, donor_tier,
    cadence_days, lead_time_days, source, giving_method, active, first_gift_date
  ) VALUES (
    p_name, 'donor', 'active', owner, p_email, NULL,
    182, 14, p_source, 'Givebutter', true, p_gift_date
  ) RETURNING id INTO new_id;

  IF p_amount_above_10k THEN
    UPDATE partners SET donor_tier = 'major' WHERE id = new_id;
  ELSE
    UPDATE partners SET donor_tier = 'first_time' WHERE id = new_id;
    IF owner IS NOT NULL THEN
      PERFORM emit_system_task(
        'crm',
        'first_time_donor:' || new_id::text,
        owner,
        'First-time donor follow-up — ' || p_name || ' (72-hr window)',
        'partnerships'::department,
        'p2'::priority,
        current_date + 3
      );
    END IF;
  END IF;

  RETURN new_id;
END $$;

-- ── 3. Thread the gift date through the human-review paths too ──
CREATE OR REPLACE FUNCTION resolve_donation_link(
  p_donation_id uuid,
  p_partner_id  uuid
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  gift record;
BEGIN
  IF NOT partnerships_has_access() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT amount_above_10k, received_on INTO gift FROM donations WHERE id = p_donation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Donation not found';
  END IF;

  UPDATE donations
     SET partner_id = p_partner_id, possible_match_partner_id = NULL
   WHERE id = p_donation_id;

  PERFORM attach_gift_to_partner(p_partner_id, gift.amount_above_10k, gift.received_on);
  PERFORM resolve_system_task('crm', 'possible_duplicate_donor:' || p_donation_id::text);
END $$;

CREATE OR REPLACE FUNCTION resolve_donation_new_partner(p_donation_id uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  gift    record;
  new_id  uuid;
BEGIN
  IF NOT partnerships_has_access() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT given_by_name, given_by_email, amount_above_10k, received_on
    INTO gift
    FROM donations WHERE id = p_donation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Donation not found';
  END IF;

  new_id := create_donor_partner_from_gift(
    coalesce(gift.given_by_name, 'Unknown donor'),
    gift.given_by_email,
    gift.amount_above_10k,
    'Givebutter',
    gift.received_on
  );

  UPDATE donations
     SET partner_id = new_id, possible_match_partner_id = NULL
   WHERE id = p_donation_id;

  PERFORM resolve_system_task('crm', 'possible_duplicate_donor:' || p_donation_id::text);
  RETURN new_id;
END $$;
