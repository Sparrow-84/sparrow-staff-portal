-- Sparrow — LCP: 3-month post-exit check-in + real daily reminder tasks.
--
-- Context (2026-10-28, Charity Navigator Impact correction): LCP's Succeed
-- definition is now "stably housed at program exit AND at a 3-month post-exit
-- check-in" -- staff don't have capacity to follow people for 6+ months. The
-- exit check-in is already required in the app when a family graduates or
-- leaves (FamilyDetailPanel); this migration covers the follow-up:
--   1. Check-in milestones → a single 3-month check-in (replaces the seeded
--      6-month / 1-year / 5-year placeholders from 0176).
--   2. A daily pg_cron job that creates a task one week before a family's
--      check-in is due, assigned to whoever logged their exit check-in.
--   3. The task closes itself once a check-in covering it is logged.
--
-- Access: unlike 0080/0139 this does NOT widen lcp_has_access() for the cron
-- context -- that function gates participant PII, and widening it would also
-- open every LCP table to the read-only QA role. Instead the emit function is
-- SECURITY DEFINER (runs as owner, so RLS doesn't apply) and EXECUTE is
-- revoked from the API roles, so only the scheduler / postgres can call it.
--
-- Depends on: 0006 (emit_system_task/resolve_system_task), 0087
-- (program_end_date), 0176 (lcp_outcome_checkins, lcp_checkin_milestones),
-- 0178 (8-arg emit_system_task with p_notes).
-- Safe to re-run.

-- ─── 1. Milestones: a single 3-month check-in ─────────────────────────────
DELETE FROM lcp_checkin_milestones WHERE months_after_exit <> 3;

INSERT INTO lcp_checkin_milestones (label, months_after_exit, sort_order)
SELECT '3-month check-in', 3, 1
WHERE NOT EXISTS (SELECT 1 FROM lcp_checkin_milestones WHERE months_after_exit = 3);

-- ─── 2. Daily reminder tasks ──────────────────────────────────────────────
-- A check-in "covers" a milestone if it's dated on or after (due date - 7
-- days) -- the same week-early window the task opens in, so calling a week
-- early counts. Mirrors nextCheckinDue() in src/lib/lcp-format.ts; keep the
-- two in step. Milestones more than 60 days overdue are skipped, so
-- backfilled historical families (exits years ago) don't flood anyone's inbox
-- -- those still show on the LCP Home "check-ins due" card.
CREATE OR REPLACE FUNCTION emit_lcp_checkin_tasks() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT f.id AS family_id,
           COALESCE(NULLIF(trim(a.full_name), ''), f.display_name) AS name,
           m.id AS milestone_id,
           m.label,
           (f.program_end_date + make_interval(months => m.months_after_exit))::date AS due,
           (SELECT c.logged_by FROM lcp_outcome_checkins c
             WHERE c.family_id = f.id AND c.logged_by IS NOT NULL
             ORDER BY (c.label = 'Exit') DESC, c.checkin_date ASC NULLS LAST, c.created_at ASC
             LIMIT 1) AS owner_id
    FROM families f
    CROSS JOIN lcp_checkin_milestones m
    LEFT JOIN LATERAL (
      SELECT full_name FROM lcp_household_adults ha WHERE ha.family_id = f.id ORDER BY ha.created_at LIMIT 1
    ) a ON true
    WHERE f.active = false AND f.program_end_date IS NOT NULL
  LOOP
    CONTINUE WHEN r.owner_id IS NULL;
    CONTINUE WHEN r.due - 7 > current_date;           -- not in the window yet
    CONTINUE WHEN r.due < current_date - 60;          -- long-stale (historical)
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM lcp_outcome_checkins c
      WHERE c.family_id = r.family_id AND c.checkin_date >= r.due - 7
    );

    PERFORM emit_system_task(
      'lcp_checkin',
      'lcp_checkin:' || r.family_id || ':' || r.milestone_id || ':' || r.due::text,
      r.owner_id,
      r.label || ' due ' || to_char(r.due, 'Mon DD, YYYY') || ' — ' || r.name,
      'lcp', 'p2', r.due,
      'Reach out and ask whether she''s still in stable housing, then log it in her family panel (Past families → her name → Log a check-in). This closes on its own once the check-in is logged.'
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION emit_lcp_checkin_tasks() FROM PUBLIC;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION emit_lcp_checkin_tasks() FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN null;
END $$;

-- ─── 3. Close the task once a covering check-in is logged ─────────────────
CREATE OR REPLACE FUNCTION resolve_lcp_checkin_task() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record;
  v_end date;
  v_due date;
BEGIN
  IF NEW.checkin_date IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT program_end_date INTO v_end FROM families WHERE id = NEW.family_id;
  IF v_end IS NULL THEN
    RETURN NEW;
  END IF;
  FOR m IN SELECT id, months_after_exit FROM lcp_checkin_milestones LOOP
    v_due := (v_end + make_interval(months => m.months_after_exit))::date;
    IF NEW.checkin_date >= v_due - 7 THEN
      PERFORM resolve_system_task('lcp_checkin', 'lcp_checkin:' || NEW.family_id || ':' || m.id || ':' || v_due::text);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER lcp_outcome_checkins_resolve_task
    AFTER INSERT OR UPDATE OF checkin_date ON lcp_outcome_checkins
    FOR EACH ROW EXECUTE FUNCTION resolve_lcp_checkin_task();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Daily at 13:00 UTC (~6am Pacific), same slot as the other reminder jobs.
DO $$ BEGIN
  PERFORM cron.schedule(
    'lcp-checkin-reminders-daily',
    '0 13 * * *',
    'SELECT emit_lcp_checkin_tasks();'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
