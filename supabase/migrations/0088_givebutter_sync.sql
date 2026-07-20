-- ============================================================
-- 0088_givebutter_sync.sql
-- Design Session H: Givebutter -> Partnerships CRM auto-sync.
--
-- What this adds:
--   1. donations.possible_match_partner_id — holds a fuzzy-matched candidate
--      when an incoming gift's email doesn't match anyone on file, but the
--      name loosely does. donations.partner_id stays NULL until a human
--      resolves it (link to the candidate, or confirm it's a new donor).
--      A gift with NO name/email match at all skips this state entirely and
--      auto-creates immediately — nothing ambiguous to review.
--   2. find_possible_donor_match() — trigram name-similarity lookup (checks
--      both a partner's name and contact_name, so a joint record like
--      "John & Jane Smith" can still be flagged against an individual gift
--      from "John Smith").
--   3. default_partnerships_owner() — the standing CRM owner (Bethany), used
--      wherever a new record needs *a* named owner but no human has claimed
--      it yet, mirroring the precedent already set for collateral/social
--      reminders in 0080.
--   4. create_donor_partner_from_gift() — single source of truth for turning
--      a gift into a new donor partner (used by both the webhook's
--      no-match-at-all path and the "confirm new donor" review action).
--   5. attach_gift_to_partner() — ratchets donor_tier to 'major' when a gift
--      is $10k+, so the existing on_partner_major_donor trigger (0037) fires
--      the same way it does for a manually-set tier. Today nothing wrote
--      this automatically from donation data; this closes that gap.
--   6. resolve_donation_link() / resolve_donation_new_partner() — the two
--      review actions Bethany takes on a flagged possible duplicate.
--   7. merge_partners() — general-purpose "merge into another partner"
--      action, usable any time a duplicate is spotted (not just ones the
--      fuzzy matcher flags). Reassigns donations + touchpoints, then deletes
--      the duplicate. Never resolves conflicting scalar fields (notes,
--      donor_tier, cadence) automatically — the UI shows both records so a
--      human decides what to keep before confirming, so nothing merges
--      silently.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. Needs-review column ────────────────────────────────────────────────
ALTER TABLE donations ADD COLUMN IF NOT EXISTS possible_match_partner_id uuid
  REFERENCES partners(id) ON DELETE SET NULL;

COMMENT ON COLUMN donations.possible_match_partner_id IS
  'Set when partner_id is NULL and a fuzzy name match was found — the gift is waiting on a human to link it to this candidate or confirm it''s a new donor. NULL partner_id with NO candidate here should not happen: that case auto-creates immediately.';

-- ── 2. Fuzzy name match ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION find_possible_donor_match(p_name text) RETURNS uuid
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT id FROM partners
  WHERE active = true
    AND GREATEST(
      similarity(lower(name), lower(p_name)),
      similarity(lower(coalesce(contact_name, '')), lower(p_name))
    ) > 0.4
  ORDER BY GREATEST(
    similarity(lower(name), lower(p_name)),
    similarity(lower(coalesce(contact_name, '')), lower(p_name))
  ) DESC
  LIMIT 1;
$$;

-- ── 3. Standing CRM owner fallback ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION default_partnerships_owner() RETURNS uuid
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT id FROM profiles
  WHERE department = 'partnerships' AND active = true
  ORDER BY created_at
  LIMIT 1;
$$;

-- ── 4. Create a new donor partner from a gift ──────────────────────────────
-- Defaults mirror AddPartnerPanel.tsx: donor cadence 182 days, lead time 14.
-- Sets donor_tier via a separate UPDATE (not at INSERT) so the existing
-- on_partner_major_donor AFTER UPDATE trigger fires naturally for a $10k+
-- first gift, instead of duplicating that trigger's task-emission logic here.
CREATE OR REPLACE FUNCTION create_donor_partner_from_gift(
  p_name             text,
  p_email            text,
  p_amount_above_10k boolean,
  p_source           text DEFAULT 'Givebutter'
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_id  uuid;
  owner   uuid := default_partnerships_owner();
BEGIN
  INSERT INTO partners (
    name, type, stage, owner_id, email, donor_tier,
    cadence_days, lead_time_days, source, giving_method, active
  ) VALUES (
    p_name, 'donor', 'active', owner, p_email, NULL,
    182, 14, p_source, 'Givebutter', true
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

-- ── 5. Attach a gift to an existing partner ────────────────────────────────
CREATE OR REPLACE FUNCTION attach_gift_to_partner(
  p_partner_id uuid,
  p_amount_above_10k boolean
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_amount_above_10k THEN
    UPDATE partners SET donor_tier = 'major'
     WHERE id = p_partner_id AND donor_tier IS DISTINCT FROM 'major';
  END IF;
END $$;

-- ── 6. Review actions (needs-review donations) ─────────────────────────────
-- Both check partnerships_has_access() themselves since they mutate donations/
-- partners directly (donations' own RLS only allows service_role to write).

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

  SELECT amount_above_10k INTO gift FROM donations WHERE id = p_donation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Donation not found';
  END IF;

  UPDATE donations
     SET partner_id = p_partner_id, possible_match_partner_id = NULL
   WHERE id = p_donation_id;

  PERFORM attach_gift_to_partner(p_partner_id, gift.amount_above_10k);
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

  SELECT given_by_name, given_by_email, amount_above_10k
    INTO gift
    FROM donations WHERE id = p_donation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Donation not found';
  END IF;

  new_id := create_donor_partner_from_gift(
    coalesce(gift.given_by_name, 'Unknown donor'),
    gift.given_by_email,
    gift.amount_above_10k
  );

  UPDATE donations
     SET partner_id = new_id, possible_match_partner_id = NULL
   WHERE id = p_donation_id;

  PERFORM resolve_system_task('crm', 'possible_duplicate_donor:' || p_donation_id::text);
  RETURN new_id;
END $$;

-- ── 7. General-purpose merge ────────────────────────────────────────────────
-- Reassigns the duplicate's donations + touchpoints into the target, then
-- deletes the (now-empty) duplicate. Deliberately does NOT try to reconcile
-- other fields (notes, donor_tier, cadence, stage) — the UI shows both
-- records side by side so a human copies over anything worth keeping BEFORE
-- calling this, rather than the system silently picking a winner.
CREATE OR REPLACE FUNCTION merge_partners(
  p_duplicate_id uuid,
  p_target_id    uuid
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT partnerships_has_access() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_duplicate_id = p_target_id THEN
    RAISE EXCEPTION 'Cannot merge a partner into itself';
  END IF;

  UPDATE donations SET partner_id = p_target_id WHERE partner_id = p_duplicate_id;
  UPDATE partner_touchpoints SET partner_id = p_target_id WHERE partner_id = p_duplicate_id;
  DELETE FROM partners WHERE id = p_duplicate_id;
END $$;
