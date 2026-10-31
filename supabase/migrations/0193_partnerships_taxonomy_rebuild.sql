-- Partnerships taxonomy rebuild — collapses the old flat type list down to three real
-- categories (donor, community [displayed "Community Partner"], volunteer) plus a new
-- sub_category describing what kind of entity a record is. Foundation, Advisory, FST, and
-- general Volunteer are left defined in the partner_type enum (removing enum values is far
-- riskier than just not using them) but are confirmed to have zero records, primary or
-- secondary, as of this migration -- nothing to migrate for any of them.
--
-- Every change below is an UPDATE on existing rows (plus one explicit test-record DELETE
-- Susanna asked for directly) -- no rows are dropped as a side effect, no columns holding
-- real content are removed without their data being preserved first. Verified against live
-- data before writing this file: 37 donor / 40 church / 11 community / 6 prayer / 1 business,
-- zero using foundation/advisory/fst/volunteer anywhere.
--
-- Also included (steps 8-9, found by auditing every server-side function that reads
-- `partners` directly in SQL, since those aren't caught by the app's typecheck): the one
-- live record sitting at the now-retired stage='reengaging' is moved to 'active', and every
-- Postgres function that referenced cadence_days/lead_time_days/stage='lapsed' on `partners`
-- is rewritten or dropped so the daily reminder cron (emit_all_partnership_reminders, runs
-- via pg_cron whether or not anyone has the room open) keeps working instead of erroring the
-- next time it fires.

-- ── 0. Remove the one explicit test record Susanna asked to clean up ───────────────────
DELETE FROM partners WHERE name = 'Susanna (Tester)' AND organization = 'Fancy Feet';

-- ── 1. New sub_category ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE partner_sub_category AS ENUM ('individual', 'business', 'nonprofit', 'church', 'prayer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE partners ADD COLUMN IF NOT EXISTS sub_category partner_sub_category;

-- ── 2. Populate sub_category from the OLD type, before any type values change ───────────
UPDATE partners SET sub_category = 'church' WHERE type = 'church' AND sub_category IS NULL;
UPDATE partners SET sub_category = 'business' WHERE type = 'business' AND sub_category IS NULL;
UPDATE partners SET sub_category = 'prayer' WHERE type = 'prayer' AND sub_category IS NULL;
-- The 11 original `community` records are all nonprofits/ministries/civic orgs (checked by
-- name individually -- Benton County Prayer Team, C.H.A.N.C.E., CO Labor Ministries,
-- Crossroad Communities, DevNW, Good News Club, Kari Kingsolver/Arc Benton County, Kiwanis
-- Club of Corvallis, Love Inc, Southside Youth Outreach). None read as a for-profit business.
UPDATE partners SET sub_category = 'nonprofit' WHERE type = 'community' AND sub_category IS NULL;

-- Donors: organization is NULL on all 37 (nothing to key off there), so classified by name.
-- Businesses by name:
UPDATE partners SET sub_category = 'business'
  WHERE type = 'donor' AND name IN ('Auskie Ag, LLC', 'Golan, LLC', 'Seaders Tree Care', 'Bright Funds')
  AND sub_category IS NULL;
-- A church that gives, logged purely as a Donor today (not also tagged Community Partner --
-- not changing that relationship, just recording what kind of entity it is):
UPDATE partners SET sub_category = 'church'
  WHERE type = 'donor' AND name = 'Desert Streams Church' AND sub_category IS NULL;
-- American Endowment Foundation (the Barbra Devyldere DAF) is a genuinely ambiguous case --
-- defaulting to individual since the underlying relationship is about her personal legacy
-- giving, not an organization Sparrow has a relationship with. Flagged for a spot-check.
-- Every remaining donor is a person or named individual/family:
UPDATE partners SET sub_category = 'individual' WHERE type = 'donor' AND sub_category IS NULL;

-- ── 3. Retype church/business into community, prayer into volunteer ────────────────────
-- (sub_category was captured from the OLD type above, so nothing is lost by this retype.)
UPDATE partners SET type = 'community' WHERE type = 'church';
UPDATE partners SET type = 'community' WHERE type = 'business';
UPDATE partners SET type = 'volunteer' WHERE type = 'prayer';

-- ── 4. Partner Provides: text -> text[], preserving every existing value ────────────────
-- Existing free-text partner_provides is real, specific content (8 records have it) that
-- doesn't map cleanly onto the new preset list -- copying it into notes verbatim rather than
-- guessing a preset, so nothing is lost. The new array column starts empty for those records;
-- staff re-tag with real presets next time they touch the record.
UPDATE partners
SET notes = COALESCE(notes || E'\n\n', '') || 'Partner provides (migrated from the old free-text field): ' || partner_provides
WHERE partner_provides IS NOT NULL AND partner_provides <> '';

ALTER TABLE partners ADD COLUMN IF NOT EXISTS partner_provides_tags text[] NOT NULL DEFAULT '{}';

-- The two records already flagged lcp_referral get the one clean, already-decided mapping:
UPDATE partners
SET partner_provides_tags = array_append(partner_provides_tags, 'LCP Participant Referral')
WHERE 'lcp_referral' = ANY(secondary_types);

-- lcp_referral is retired as a category -- drop it from every secondary_types array now that
-- its meaning has moved to partner_provides_tags.
UPDATE partners
SET secondary_types = array_remove(secondary_types, 'lcp_referral')
WHERE 'lcp_referral' = ANY(secondary_types);

-- Old free-text column kept for one release as a safety net (already copied into notes above,
-- and the app will stop reading it) -- drop it in a later migration once confirmed unneeded.
COMMENT ON COLUMN partners.partner_provides IS
  'Deprecated -- migrated into notes and partner_provides_tags by 0193. Safe to drop once confirmed unused.';

-- ── 5. Lead time on partner records -- confirmed dead code (the real due-soon calculation
-- already hardcodes a flat window and never reads this), actively misleading to keep ───────
ALTER TABLE partners DROP COLUMN IF EXISTS lead_time_days;

-- ── 6. Touchpoints: replace the generic recurring cadence with one-off named items ───────
-- "Subscribed to TSM" (already shipped) now covers the default plan for most relationships.
-- `needs_additional_touchpoint` unlocks a single named, dated item for the relationships
-- that genuinely need one (mainly Community Partners) -- e.g. "MOU check-in -- due Oct 2028",
-- not a recurring rhythm. cadence_days represented the old recurring-rhythm concept this
-- replaces, and is just as dead as lead_time_days was once this lands.
ALTER TABLE partners ADD COLUMN IF NOT EXISTS needs_additional_touchpoint boolean NOT NULL DEFAULT false;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS additional_touchpoint_label text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS additional_touchpoint_due date;

-- Carry the signal forward, not the exact math: any Community Partner that had a real
-- cadence set under the old model was being actively tracked for a reason -- rather than
-- silently dropping that, flag it for a real named item so a human reviews and renames it,
-- instead of inventing a specific label ourselves. Donors and Volunteers are NOT carried
-- forward -- the new design covers them fully through TSM + their fixed thank-yous, so
-- reviving their old cadence here would just recreate the clutter this redesign removes.
UPDATE partners
SET needs_additional_touchpoint = true,
    additional_touchpoint_label = 'Review touchpoint plan (carried over from the old cadence)',
    additional_touchpoint_due = (COALESCE(last_touchpoint_at::date, created_at::date) + (cadence_days || ' days')::interval)::date
WHERE type = 'community' AND cadence_days IS NOT NULL;

ALTER TABLE partners DROP COLUMN IF EXISTS cadence_days;

-- ── 7. "Done" status for comms production milestones (did not exist before) ─────────────
ALTER TABLE partnership_comms_milestones ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- ── 8. Stage: 'lapsed'/'reengaging' retired as stage values (lapsed is now purely computed,
-- see isLapsed() in partnerships-types.ts) -- the partner_stage enum keeps both values
-- defined (removing enum values is far riskier than just not using them, same call as
-- partner_type above), but verified against live data before writing this migration: zero
-- records at stage='lapsed', exactly one at stage='reengaging' (Jenna Wenger, Volunteer/
-- Prayer, active and touched as recently as 2026-09-22 -- i.e. actually being stewarded
-- right now). 'Active' is the one real equivalent left in the new 3-stage model, and
-- nothing about her record needs a carried-forward touchpoint (that carry-forward in
-- step 6 is scoped to Community Partner only, matching the design call that Donors and
-- Volunteers need no named touchpoint by default).
UPDATE partners SET stage = 'active' WHERE stage = 'reengaging';
UPDATE partners SET stage = 'active' WHERE stage = 'lapsed';

-- ── 9. Server-side functions that read the now-dropped cadence_days/lead_time_days or the
-- now-retired stage='lapsed' directly in SQL -- these would error or silently misbehave the
-- next time the daily reminder cron runs if left alone, since they're not reachable by the
-- app-level tsc/build check that caught everything else. Found by searching every migration
-- for cadence_days/lead_time_days/'lapsed' usage against the `partners` table specifically
-- (the same columns on partnership_collateral/partnership_recurring_settings/grants are
-- untouched -- those are separate tables with their own independent cadence model).

-- emit_due_touchpoint_tasks() (final version: migration 0115) -- rewritten to read the new
-- named-touchpoint fields instead of the generic cadence. No more lead-time warning window
-- (lead_time_days is gone); a task now appears exactly on additional_touchpoint_due, matching
-- the exact-date model the rest of this migration establishes.
CREATE OR REPLACE FUNCTION emit_due_touchpoint_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT id, name, owner_id, additional_touchpoint_label, additional_touchpoint_due
    FROM partners
    WHERE active
      AND needs_additional_touchpoint
      AND additional_touchpoint_due IS NOT NULL
      AND owner_id IS NOT NULL
      AND additional_touchpoint_due <= current_date
  LOOP
    PERFORM emit_system_task(
      'crm', 'touchpoint:' || r.id, r.owner_id,
      COALESCE(r.additional_touchpoint_label, 'Touchpoint due') || ' — ' || r.name,
      'partnerships'::department, 'p2'::priority, r.additional_touchpoint_due
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- create_donor_partner_from_gift() (final version: migration 0115) -- the Givebutter sync
-- path for a brand-new donor. Drops cadence_days/lead_time_days from the INSERT (columns no
-- longer exist); a new donor simply starts with needs_additional_touchpoint = false (its
-- column default), matching every other donor under the new model.
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
    source, giving_method, active, first_gift_date
  ) VALUES (
    p_name, 'donor', 'active', owner, p_email, NULL,
    p_source, 'Givebutter', true, p_gift_date
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

-- emit_lapsed_partner_tasks() + its resolving trigger (migration 0036) are now permanently
-- dead: nothing in the app can ever set stage='lapsed' again (confirmed by code search --
-- the stage dropdown only offers prospect/active/inactive), so this function would run
-- forever finding zero rows. Dropping it outright rather than leaving it as inert dead code,
-- same call already made for lead_time_days above.
DROP TRIGGER IF EXISTS partner_stage_changed ON partners;
DROP FUNCTION IF EXISTS on_partner_stage_changed();
DROP FUNCTION IF EXISTS emit_lapsed_partner_tasks();

-- Dispatcher (final version: migration 0110) -- drop the now-removed emit_lapsed_partner_tasks
-- call.
CREATE OR REPLACE FUNCTION emit_all_partnership_reminders() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total int := 0;
BEGIN
  total := total + emit_due_touchpoint_tasks();
  total := total + emit_collateral_review_tasks();
  total := total + emit_overdue_connection_followups();
  total := total + emit_social_post_reminder();
  total := total + emit_newsletter_reminder_tasks();
  total := total + emit_comms_milestone_tasks();
  RETURN total;
END $$;

-- emit_comms_milestone_tasks() (final version: migration 0110) -- the new completed_at column
-- (step 7 above) didn't exist when this was last written, so it has no way to stop nagging
-- about a milestone someone's already marked done. Add that one check.
CREATE OR REPLACE FUNCTION emit_comms_milestone_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT m.id, m.label, m.due_date, m.owner_id, c.title
    FROM partnership_comms_milestones m
    JOIN partnership_comms c ON c.id = m.comm_id
    WHERE m.due_date <= current_date
      AND m.owner_id IS NOT NULL
      AND m.completed_at IS NULL
  LOOP
    PERFORM emit_system_task(
      'crm', 'comms_milestone:' || r.id, r.owner_id,
      r.label || ' — ' || r.title,
      'partnerships'::department, 'p3'::priority, r.due_date
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Marking a milestone done (completed_at set) resolves its task the same way logging a
-- collateral review does (on_collateral_reviewed, migration 0080) -- the future Comms
-- Production Calendar UI's "Mark done" just needs to set completed_at; no separate RPC.
CREATE OR REPLACE FUNCTION on_comms_milestone_completed() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    PERFORM resolve_system_task('crm', 'comms_milestone:' || NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partnership_comms_milestone_completed ON partnership_comms_milestones;
CREATE TRIGGER partnership_comms_milestone_completed AFTER UPDATE ON partnership_comms_milestones
  FOR EACH ROW WHEN (OLD.completed_at IS DISTINCT FROM NEW.completed_at)
  EXECUTE FUNCTION on_comms_milestone_completed();
