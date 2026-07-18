-- Partnerships Room — 3 bug fixes (product decisions confirmed).
-- Run AFTER 0078_grants.sql.
--
-- 1. emit_overdue_connection_followups() was assigning the follow-up task to
--    auth.uid() — whoever happened to have the Events tab open — instead of the
--    connection's actual owner. It also dropped the event name from the task
--    title. Fixed by adding a real owner_id column to partnership_connections
--    (mirrors the owner_id pattern already used on partners) and routing each
--    follow-up task to that connection's own owner_id, joining partnership_events
--    for the event name. Connections with no owner set (owner_id IS NULL —
--    including every row that predates this column) are skipped rather than
--    falling back to any hardcoded default; there is no standing "everyone's
--    default owner" for this list, since new partnerships staff should own their
--    own connections instead of routing through Bethany by default.
--
-- 2. Collateral review reminder: the Collateral tab only ever showed an on-screen
--    banner 30 days out — nothing landed in Bethany's Incoming Tasks if she wasn't
--    looking at that screen. Adds emit_collateral_review_task(), which mirrors the
--    existing emit_*/sync* pattern (a dedup-safe function called from the client on
--    tab load — see emit_due_touchpoint_tasks in 0008, emit_lapsed_partner_tasks in
--    0036, emit_overdue_connection_followups in 0038). There is no pg_cron job or
--    scheduled edge function in this project; every emit_* task-pusher fires when a
--    signed-in staff member with room access loads the relevant screen, and this one
--    follows suit. The March 1 / Sept 1 weekend-adjustment math is reproduced in SQL
--    from PartnershipCollateralTab.tsx's getNextReviewDate()/draftsDue() exactly as-is
--    — not modified.

-- ─── 1. Fix: route Events-tab follow-up task to the connection's owner + include event name ──
ALTER TABLE partnership_connections ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES profiles(id);

CREATE OR REPLACE FUNCTION emit_overdue_connection_followups() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT c.id, c.name, c.followup_due, c.owner_id, e.event_name
    FROM   partnership_connections c
    LEFT JOIN partnership_events e ON e.id = c.event_id
    WHERE  c.followup_done = false
      AND  c.followup_due  < current_date
      AND  c.owner_id IS NOT NULL               -- no owner set — skip rather than guess a default
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

-- ─── 2. Collateral review task ────────────────────────────────────────
-- Reproduces PartnershipCollateralTab.tsx's date math: March 1 / Sept 1, shifted
-- back to Friday when it lands on a Saturday or Sunday, rolled to next year once
-- that date has passed. Returns whichever of the two upcoming dates is sooner —
-- the same "both" behavior the client's getNextReviewDate() uses.
CREATE OR REPLACE FUNCTION next_collateral_review_date() RETURNS date
  LANGUAGE plpgsql STABLE AS $$
DECLARE
  yr      int := extract(year FROM current_date)::int;
  march_d date;
  sept_d  date;
BEGIN
  march_d := make_date(yr, 3, 1);
  IF extract(dow FROM march_d) = 6 THEN march_d := march_d - 1; END IF;
  IF extract(dow FROM march_d) = 0 THEN march_d := march_d - 2; END IF;
  IF march_d <= current_date THEN
    march_d := make_date(yr + 1, 3, 1);
    IF extract(dow FROM march_d) = 6 THEN march_d := march_d - 1; END IF;
    IF extract(dow FROM march_d) = 0 THEN march_d := march_d - 2; END IF;
  END IF;

  sept_d := make_date(yr, 9, 1);
  IF extract(dow FROM sept_d) = 6 THEN sept_d := sept_d - 1; END IF;
  IF extract(dow FROM sept_d) = 0 THEN sept_d := sept_d - 2; END IF;
  IF sept_d <= current_date THEN
    sept_d := make_date(yr + 1, 9, 1);
    IF extract(dow FROM sept_d) = 6 THEN sept_d := sept_d - 1; END IF;
    IF extract(dow FROM sept_d) = 0 THEN sept_d := sept_d - 2; END IF;
  END IF;

  RETURN least(march_d, sept_d);
END $$;

-- Push "Collateral review due [date] — submit drafts to Susanna" (P3) to Bethany
-- once we're inside the 2-week drafts-due window ahead of the next review date.
-- Dedup-safe via source_ref = 'collateral_review:<review_date>' — the key changes
-- each cycle, so the next cycle's reminder emits as a fresh task automatically.
CREATE OR REPLACE FUNCTION emit_collateral_review_task() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  review_date date;
  draft_due   date;
  bethany_id  uuid;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;

  review_date := next_collateral_review_date();
  draft_due   := review_date - 14;

  IF current_date < draft_due THEN
    RETURN 0;                                   -- outside the 2-week drafts-due window
  END IF;

  SELECT id INTO bethany_id FROM profiles WHERE full_name ILIKE 'Bethany%' AND active = true LIMIT 1;
  IF bethany_id IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM emit_system_task(
    'crm',
    'collateral_review:' || review_date::text,
    bethany_id,
    'Collateral review due ' || to_char(review_date, 'FMMonth FMDD, YYYY') || ' — submit drafts to Susanna',
    'partnerships'::department,
    'p3'::priority,
    draft_due
  );
  RETURN 1;
END $$;
