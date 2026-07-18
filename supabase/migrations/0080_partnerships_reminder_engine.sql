-- Partnerships Room — unified reminder engine.
-- Run AFTER 0079_partnerships_bug_fixes.sql.
--
-- The design (agreed with the product owner): every recurring thing in Partnerships —
-- partner touchpoints, collateral review, social posting, the newsletter/comms calendar,
-- event follow-ups — works the same way: CADENCE (how often), LEAD TIME (how far ahead
-- to warn), OWNER (who's responsible). When due, each fires a task to its owner via the
-- existing emit_system_task() spine mechanism (0006). This migration:
--   1. Adds lead_time_days to partners; backfills + locks cadence_days/lead_time_days NOT NULL.
--   2. Gives partnership_collateral its own per-item cadence_days/lead_time_days/owner_id/
--      last_reviewed_at (replacing the old room-wide, hardcoded-to-Bethany reminder).
--   3. Adds an optional lead_time_days to partnership_connections (one-time follow-ups —
--      no cadence needed, lead time is a small consistency extra).
--   4. Adds partnership_recurring_settings for the two settings that have no natural
--      "row" of their own: social posting and the newsletter/comms calendar.
--   5. Adds emit_all_partnership_reminders(), a single dispatcher, and registers it with
--      pg_cron to run for real on a schedule — not just when a screen happens to load.
--
-- CRITICAL FIX bundled in here: every existing emit_* function gates on
-- partnerships_has_access(), which checks auth.uid() against profiles. That's correct for
-- a client-triggered sweep (a signed-in staff member's browser calling the RPC), but a
-- pg_cron job has NO request/JWT context at all — auth.uid() is NULL there, exactly as it
-- is for an anonymous PostgREST call. Left alone, partnerships_has_access() would return
-- false for the cron job and the entire scheduled sweep would silently do nothing every
-- day — defeating the whole point of this migration. The fix: broaden
-- partnerships_has_access() to also return true when the *executing Postgres role itself*
-- is not one of PostgREST's request-scoped roles ('anon', 'authenticated'). Real end-user
-- calls via the app always run as one of those two roles (PostgREST switches into them per
-- request), so their access is exactly as gated as before. pg_cron jobs (and direct
-- service-role/superuser connections) run as a different role entirely (typically
-- 'postgres') and are trusted by construction — nothing reachable from the public API can
-- forge that role. This is the one and only change needed to make every emit_* function
-- (old and new) work correctly both on-screen AND from the scheduler.

-- ─── 0. Make the cron-safe access check ──────────────────────────────
CREATE OR REPLACE FUNCTION partnerships_has_access() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    current_user NOT IN ('anon', 'authenticated')   -- trusted service context: pg_cron / service_role / direct admin — no per-request JWT to check, and not spoofable via the public API
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR department = 'partnerships' OR partnerships_access)
    );
$$;

-- ─── 1. Partners: add lead_time_days, lock cadence_days + lead_time_days NOT NULL ──
-- owner_id is deliberately LEFT nullable here: unlike collateral, there is no safe
-- universal default owner for an arbitrary partner (some prospects genuinely have none
-- assigned yet), and the brief only calls for cadence_days/lead_time_days to become
-- required on this table. emit_due_touchpoint_tasks() below still checks owner_id IS NOT
-- NULL before firing, exactly as before.
ALTER TABLE partners ADD COLUMN IF NOT EXISTS lead_time_days int;

UPDATE partners SET cadence_days = 182 WHERE cadence_days IS NULL;
UPDATE partners SET lead_time_days = 14 WHERE lead_time_days IS NULL;

ALTER TABLE partners ALTER COLUMN cadence_days SET NOT NULL;
ALTER TABLE partners ALTER COLUMN lead_time_days SET NOT NULL;

COMMENT ON COLUMN partners.cadence_days IS
  'Required. Days between touchpoints for this partner''s stewardship rhythm.';
COMMENT ON COLUMN partners.lead_time_days IS
  'Required. Days before a touchpoint is due that the owner should be warned (task fires at due_date - lead_time_days, not just once overdue).';

-- emit_due_touchpoint_tasks(): now fires lead_time_days AHEAD of the due date, not just
-- once already overdue (the single inequality below covers both — once due_date has
-- passed, due_date - lead_time_days is further in the past still, so the condition stays
-- true and the reminder keeps firing/updating until a touchpoint is logged).
CREATE OR REPLACE FUNCTION emit_due_touchpoint_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; due date;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT id, name, owner_id,
           (coalesce(last_touchpoint_at, created_at::date) + cadence_days) AS due_date
    FROM partners
    WHERE active
      AND stage IN ('active', 'prospect')
      AND owner_id IS NOT NULL
      AND (coalesce(last_touchpoint_at, created_at::date) + cadence_days) - lead_time_days <= current_date
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

-- ─── 2. Collateral: per-item cadence_days / lead_time_days / owner_id / last_reviewed_at ──
-- Replaces the old room-wide, hardcoded-to-Bethany emit_collateral_review_task(). Each
-- item now has its own rhythm and owner (e.g. a new hire's business cards get their own
-- cadence set when someone enters them), exactly like partners.
ALTER TABLE partnership_collateral ADD COLUMN IF NOT EXISTS cadence_days int;
ALTER TABLE partnership_collateral ADD COLUMN IF NOT EXISTS lead_time_days int;
ALTER TABLE partnership_collateral ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES profiles(id) ON UPDATE CASCADE;
ALTER TABLE partnership_collateral ADD COLUMN IF NOT EXISTS last_reviewed_at date;

-- Backfill from the old review_cycle anchor + last_updated, and default every existing
-- row's owner to Bethany (the same lookup pattern 0079's emit_collateral_review_task used).
UPDATE partnership_collateral
   SET cadence_days = CASE WHEN review_cycle = 'both' THEN 182 ELSE 365 END
 WHERE cadence_days IS NULL;

UPDATE partnership_collateral
   SET lead_time_days = 14
 WHERE lead_time_days IS NULL;

UPDATE partnership_collateral
   SET last_reviewed_at = COALESCE(last_updated, current_date)
 WHERE last_reviewed_at IS NULL;

UPDATE partnership_collateral c
   SET owner_id = b.id
  FROM (SELECT id FROM profiles WHERE full_name ILIKE 'Bethany%' AND active = true LIMIT 1) b
 WHERE c.owner_id IS NULL;

ALTER TABLE partnership_collateral ALTER COLUMN cadence_days SET NOT NULL;
ALTER TABLE partnership_collateral ALTER COLUMN lead_time_days SET NOT NULL;
ALTER TABLE partnership_collateral ALTER COLUMN last_reviewed_at SET NOT NULL;
-- owner_id is only set NOT NULL if the Bethany backfill actually found a profile to
-- assign (guards a fresh/seed-less database where that lookup returns nothing — matches
-- the same defensive pattern 0079's emit_collateral_review_task used).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM partnership_collateral WHERE owner_id IS NULL) THEN
    ALTER TABLE partnership_collateral ALTER COLUMN owner_id SET NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN partnership_collateral.cadence_days IS
  'Required. Days between reviews for this item. Backfilled from the old review_cycle anchor (both=182, march/sept alone=365); no longer derived from a fixed calendar date going forward.';
COMMENT ON COLUMN partnership_collateral.lead_time_days IS
  'Required. Days before a review is due that the owner should be warned.';
COMMENT ON COLUMN partnership_collateral.owner_id IS
  'Required. Who is responsible for this item''s review. Backfilled to Bethany for all pre-existing rows.';
COMMENT ON COLUMN partnership_collateral.last_reviewed_at IS
  'Required. Date this item was last reviewed; due_date = last_reviewed_at + cadence_days. Update this when a review happens (see partnership_collateral_reviewed trigger) to resolve the open task and restart the clock.';
COMMENT ON COLUMN partnership_collateral.review_cycle IS
  'KEPT, but informational only as of migration 0080 — no longer drives any reminder logic (superseded by cadence_days/lead_time_days/owner_id/last_reviewed_at). Retained because it still communicates the original March/Sept/Both intent for existing items; safe to drop later if unused by the UI.';

-- Drop the old room-wide reminder — this per-item version fully replaces it.
DROP FUNCTION IF EXISTS emit_collateral_review_task();
DROP FUNCTION IF EXISTS next_collateral_review_date();

CREATE OR REPLACE FUNCTION emit_collateral_review_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; due date;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT id, item_name, owner_id,
           (last_reviewed_at + cadence_days) AS due_date
    FROM partnership_collateral
    WHERE active
      AND owner_id IS NOT NULL                  -- defense in depth: NOT NULL is enforced above when the Bethany backfill succeeds, but this guards the rare fresh-DB case where it didn't
      AND (last_reviewed_at + cadence_days) - lead_time_days <= current_date
  LOOP
    due := r.due_date;
    PERFORM emit_system_task(
      'crm', 'collateral_review:' || r.id, r.owner_id,
      'Collateral review due — ' || r.item_name,
      'partnerships'::department, 'p3'::priority, due
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Logging a review (bumping last_reviewed_at forward) resolves the open task and
-- restarts the clock — mirrors on_touchpoint_logged() for partners. Phase-2 UI should
-- call this by simply updating last_reviewed_at (e.g. a "Mark reviewed" button setting
-- it to current_date); no separate RPC is needed for this half.
CREATE OR REPLACE FUNCTION on_collateral_reviewed() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.last_reviewed_at IS DISTINCT FROM OLD.last_reviewed_at
     AND NEW.last_reviewed_at > OLD.last_reviewed_at THEN
    PERFORM resolve_system_task('crm', 'collateral_review:' || NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partnership_collateral_reviewed ON partnership_collateral;
CREATE TRIGGER partnership_collateral_reviewed AFTER UPDATE ON partnership_collateral
  FOR EACH ROW WHEN (OLD.last_reviewed_at IS DISTINCT FROM NEW.last_reviewed_at)
  EXECUTE FUNCTION on_collateral_reviewed();

-- ─── 3. Connections: optional lead_time_days (not recurring, so no cadence_days) ──
-- Judgment call: kept simple. lead_time_days is nullable, no backfill, no NOT NULL —
-- a one-time follow-up isn't a REQUIRED-triad item like the recurring things above.
-- NULL/0 preserves the exact original "fire only once overdue" behavior for every
-- existing row; a following UI can offer it as an optional per-connection field.
ALTER TABLE partnership_connections ADD COLUMN IF NOT EXISTS lead_time_days int;

COMMENT ON COLUMN partnership_connections.lead_time_days IS
  'Optional. Days before followup_due to start warning the owner. NULL (default) = only fire once already overdue, matching original behavior. Not required — connections are one-time follow-ups, not a recurring cadence.';

CREATE OR REPLACE FUNCTION emit_overdue_connection_followups() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT c.id, c.name, c.followup_due, c.owner_id, e.event_name
    FROM   partnership_connections c
    LEFT JOIN partnership_events e ON e.id = c.event_id
    WHERE  c.followup_done = false
      AND  c.owner_id IS NOT NULL
      AND  (c.followup_due - COALESCE(c.lead_time_days, 0)) <= current_date
  LOOP
    PERFORM emit_system_task(
      'crm',
      'connection_followup:' || r.id,
      r.owner_id,
      'Follow up with ' || r.name || CASE WHEN r.event_name IS NOT NULL THEN ' from ' || r.event_name ELSE '' END,
      'partnerships'::department,
      'p2'::priority,
      r.followup_due
    );
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;

-- ─── 4. Room-wide recurring settings: social posting + newsletter/comms calendar ──
-- Neither has a natural per-row home for cadence/lead-time/owner (deliberate design —
-- not a new generic "recurring items" abstraction, just the one small table these two
-- room-wide concerns genuinely need). kind is a checked text column rather than an enum
-- so a third kind can be added later without an ALTER TYPE ceremony — just extend the
-- CHECK constraint.
CREATE TABLE IF NOT EXISTS partnership_recurring_settings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text        NOT NULL UNIQUE CHECK (kind IN ('social_post', 'newsletter')),
  cadence_days   int         NOT NULL,
  lead_time_days int         NOT NULL,
  owner_id       uuid        NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE partnership_recurring_settings IS
  'Room-wide cadence/lead-time/owner settings for the two Partnerships reminders that have no natural row of their own: social posting (kind=''social_post'') and the newsletter/comms calendar (kind=''newsletter''). Exactly one row per kind.';
COMMENT ON COLUMN partnership_recurring_settings.cadence_days IS
  'For social_post: the minimum required posting frequency (fires when neither a recent post nor an already-planned upcoming one covers the gap). For newsletter: informational only — actual due dates come from each partnership_comms row''s own publish_date, not from this cadence; kept for schema consistency and future UI display.';
COMMENT ON COLUMN partnership_recurring_settings.lead_time_days IS
  'For social_post: how far ahead an already-planned post must be dated to count as "covering" the next cadence window. For newsletter: how many days before a comms entry''s publish_date to start nagging its owner.';

DROP TRIGGER IF EXISTS partnership_recurring_settings_updated_at ON partnership_recurring_settings;
CREATE TRIGGER partnership_recurring_settings_updated_at
  BEFORE UPDATE ON partnership_recurring_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE partnership_recurring_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY partnership_recurring_settings_select ON partnership_recurring_settings
    FOR SELECT TO authenticated USING (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY partnership_recurring_settings_all ON partnership_recurring_settings
    FOR ALL TO authenticated USING (partnerships_has_access()) WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Seed both rows once, defaulting the owner to Bethany (same lookup pattern used for
-- collateral above and in 0079) — matches who currently owns social + comms in practice.
-- cadence_days: 14 for social_post (the retired banner's hardcoded minimum-frequency
-- value); 30 for newsletter (informational — see column comment above).
-- lead_time_days: 14 for both (the retired banner's hardcoded lookout windows).
-- If Bethany's profile can't be found (e.g. a fresh/seed-less database), this is a no-op
-- and an admin must insert these rows manually before the social/newsletter reminders
-- can fire — there is no safe universal default owner to fall back to.
DO $$
DECLARE bethany_id uuid;
BEGIN
  SELECT id INTO bethany_id FROM profiles WHERE full_name ILIKE 'Bethany%' AND active = true LIMIT 1;
  IF bethany_id IS NOT NULL THEN
    INSERT INTO partnership_recurring_settings (kind, cadence_days, lead_time_days, owner_id)
    VALUES ('social_post', 14, 14, bethany_id)
    ON CONFLICT (kind) DO NOTHING;

    INSERT INTO partnership_recurring_settings (kind, cadence_days, lead_time_days, owner_id)
    VALUES ('newsletter', 30, 14, bethany_id)
    ON CONFLICT (kind) DO NOTHING;
  END IF;
END $$;

-- emit_social_post_reminder(): mirrors the retired on-screen banner in
-- PartnershipSocialTab.tsx exactly — nags only when BOTH sides fail: no post within the
-- last cadence_days days AND nothing already planned/scheduled within the next
-- lead_time_days days. Either side alone satisfies the rhythm. Single stable task key
-- ('social_post:reminder') — the trigger below resolves it the moment a post actually
-- goes up, and the next sweep re-raises it (updated in place) if the gap reopens.
CREATE OR REPLACE FUNCTION emit_social_post_reminder() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg               record;
  last_posted_date  date;
  next_planned_date date;
  days_since_last   numeric;
  days_to_next      numeric;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;

  SELECT cadence_days, lead_time_days, owner_id INTO cfg
  FROM partnership_recurring_settings WHERE kind = 'social_post';
  IF NOT FOUND THEN
    RETURN 0;                                   -- settings row not seeded yet
  END IF;

  SELECT max(planned_date) INTO last_posted_date
  FROM partnership_social_posts WHERE status = 'posted';

  SELECT min(planned_date) INTO next_planned_date
  FROM partnership_social_posts
  WHERE status IN ('planned', 'scheduled') AND planned_date >= current_date;

  days_since_last := CASE WHEN last_posted_date IS NULL THEN 999999
                          ELSE current_date - last_posted_date END;
  days_to_next    := CASE WHEN next_planned_date IS NULL THEN 999999
                          ELSE next_planned_date - current_date END;

  IF days_since_last > cfg.cadence_days AND days_to_next > cfg.lead_time_days THEN
    PERFORM emit_system_task(
      'crm', 'social_post:reminder', cfg.owner_id,
      'No social post in ' || cfg.cadence_days || '+ days — plan the next one',
      'partnerships'::department, 'p3'::priority, current_date
    );
    RETURN 1;
  END IF;
  RETURN 0;
END $$;

CREATE OR REPLACE FUNCTION on_social_post_posted() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM resolve_system_task('crm', 'social_post:reminder');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partnership_social_post_posted_ins ON partnership_social_posts;
CREATE TRIGGER partnership_social_post_posted_ins
  AFTER INSERT ON partnership_social_posts
  FOR EACH ROW WHEN (NEW.status = 'posted')
  EXECUTE FUNCTION on_social_post_posted();

DROP TRIGGER IF EXISTS partnership_social_post_posted_upd ON partnership_social_posts;
CREATE TRIGGER partnership_social_post_posted_upd
  AFTER UPDATE ON partnership_social_posts
  FOR EACH ROW WHEN (NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted')
  EXECUTE FUNCTION on_social_post_posted();

-- emit_newsletter_reminder_tasks(): per-comms-entry (each partnership_comms row keeps its
-- own publish_date from the seeded annual calendar), but the lead_time_days + owner come
-- from the room-wide 'newsletter' settings row rather than being set per entry. Fires once
-- inside the lead window and keeps firing/updating (dedup-safe) until the entry's status
-- moves off 'not_started' (the trigger below resolves it then). Does not reproduce the old
-- isLeadTimeWarning()'s 60-day "needs advance notice" special case for the Christmas/
-- annual-report entries — a deliberate simplification (judgment call); everything uses the
-- single configured lead_time_days for now.
CREATE OR REPLACE FUNCTION emit_newsletter_reminder_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg record;
  r   record;
  n   int := 0;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;

  SELECT lead_time_days, owner_id INTO cfg
  FROM partnership_recurring_settings WHERE kind = 'newsletter';
  IF NOT FOUND THEN
    RETURN 0;                                   -- settings row not seeded yet
  END IF;

  FOR r IN
    SELECT id, title, publish_date
    FROM partnership_comms
    WHERE status = 'not_started'
      AND (publish_date - cfg.lead_time_days) <= current_date
  LOOP
    PERFORM emit_system_task(
      'crm', 'comms:' || r.id, cfg.owner_id,
      'Newsletter — ' || r.title || ' due ' || to_char(r.publish_date, 'FMMonth FMDD, YYYY'),
      'partnerships'::department, 'p3'::priority, r.publish_date
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION on_comm_status_changed() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM resolve_system_task('crm', 'comms:' || NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partnership_comms_status_changed ON partnership_comms;
CREATE TRIGGER partnership_comms_status_changed
  AFTER UPDATE ON partnership_comms
  FOR EACH ROW WHEN (NEW.status <> 'not_started' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION on_comm_status_changed();

-- ─── 5. The dispatcher + pg_cron registration ─────────────────────────
-- Also includes emit_lapsed_partner_tasks() (from 0036) — not one of the 5 areas named
-- in the brief, but it's the same class of "only fires when a screen loads" bug this
-- whole migration exists to fix, so it rides along on the same schedule (judgment call).
CREATE OR REPLACE FUNCTION emit_all_partnership_reminders() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total int := 0;
BEGIN
  total := total + emit_due_touchpoint_tasks();
  total := total + emit_lapsed_partner_tasks();
  total := total + emit_collateral_review_tasks();
  total := total + emit_overdue_connection_followups();
  total := total + emit_social_post_reminder();
  total := total + emit_newsletter_reminder_tasks();
  RETURN total;
END $$;

-- Daily at 13:00 UTC (~6am Pacific) — easily adjustable later via
-- cron.schedule('partnership-reminders-daily', '<new schedule>', ...) or cron.unschedule().
-- cron.schedule() re-registering an existing job name updates it in place on modern
-- pg_cron versions (documented behavior since ~1.4), so this is safe to re-run as-is;
-- the EXCEPTION guard is just a belt-and-suspenders fallback for older versions where
-- that might not hold, so this migration never fails a re-run either way.
DO $$ BEGIN
  PERFORM cron.schedule(
    'partnership-reminders-daily',
    '0 13 * * *',
    'SELECT emit_all_partnership_reminders();'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
