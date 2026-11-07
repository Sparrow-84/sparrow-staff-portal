-- Sparrow Staff Portal — Social Media reminder: fixed two-week rule + task fixes
-- Run AFTER 0211_collateral_next_review.sql.
--
-- Decided with the product owner 2026-11-07 while writing the Social Media tab guide:
--   * The Cadence + Lead time settings are gone from the app. The rule is now fixed and written
--     on the tab: aim to post at least every two weeks. The owner gets a reminder when nothing
--     has gone up in 14 days AND nothing is planned for the next 14. Only the Owner setting
--     stays. partnership_recurring_settings.cadence_days / lead_time_days are kept (the
--     newsletter row still uses lead_time_days; the social_post row's values are now unused).
--   * Bug fix: every reminder reused one source_ref ('social_post:reminder'), and
--     emit_system_task never reopens a done task, so after the first reminder was closed the
--     owner never got another one. Refs are now per gap: 'social_post:reminder:<last posted
--     date>' (or ':none' before the first post), so each new gap gets a fresh task.
--   * Planning a post inside the next two weeks now closes the open reminder too (before, only
--     a post going up did).
--   * Changing the reminder owner (social or newsletter) now moves the open tasks to the new
--     owner. Before, they stayed with the old owner.
-- Safe to re-run.

COMMENT ON COLUMN partnership_recurring_settings.cadence_days IS
  'Newsletter row: unused. social_post row: UNUSED since 0212 (fixed at 14 days). Kept as a record.';
COMMENT ON COLUMN partnership_recurring_settings.lead_time_days IS
  'Newsletter row: how many days before a publish date its task appears. social_post row: UNUSED since 0212 (fixed at 14 days).';

-- ─── 1. Is there a posting gap right now? ─────────────────────────────
-- One place for the rule, shared by the emitter and the post trigger. Returns the last posted
-- date's ref suffix when there IS a gap, NULL when the rhythm is fine.
CREATE OR REPLACE FUNCTION social_post_gap_ref() RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  last_posted date;
  next_planned date;
BEGIN
  SELECT max(planned_date) INTO last_posted
  FROM partnership_social_posts WHERE status = 'posted';

  SELECT min(planned_date) INTO next_planned
  FROM partnership_social_posts
  WHERE status IN ('planned', 'scheduled') AND planned_date >= current_date;

  IF (last_posted IS NULL OR current_date - last_posted > 14)
     AND (next_planned IS NULL OR next_planned - current_date > 14) THEN
    RETURN 'social_post:reminder:' || COALESCE(last_posted::text, 'none');
  END IF;
  RETURN NULL;
END $$;

-- ─── 2. Carry an open old-style task onto the new per-gap ref ──────────
UPDATE tasks
   SET source_ref = COALESCE(social_post_gap_ref(), 'social_post:reminder:legacy'), updated_at = now()
 WHERE source_system = 'crm'
   AND source_ref = 'social_post:reminder'
   AND status <> 'done';

-- ─── 3. Emitter: one task per gap ─────────────────────────────────────
CREATE OR REPLACE FUNCTION emit_social_post_reminder() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_ref   text;
BEGIN
  IF NOT partnerships_has_access() THEN
    RETURN 0;
  END IF;

  SELECT owner_id INTO v_owner FROM partnership_recurring_settings WHERE kind = 'social_post';
  IF NOT FOUND THEN
    RETURN 0;                                   -- settings row not seeded yet
  END IF;

  v_ref := social_post_gap_ref();
  IF v_ref IS NULL THEN
    -- Rhythm is fine: any reminder still open is stale.
    PERFORM social_post_close_reminders();
    RETURN 0;
  END IF;

  PERFORM emit_system_task(
    'crm', v_ref, v_owner,
    'No social post in two weeks — plan the next one',
    'partnerships'::department, 'p3'::priority, current_date
  );
  RETURN 1;
END $$;

CREATE OR REPLACE FUNCTION social_post_close_reminders() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE tasks SET status = 'done', updated_at = now()
   WHERE source_system = 'crm'
     AND source_ref LIKE 'social_post:reminder%'
     AND status <> 'done';
END $$;

-- ─── 4. Posting OR planning a post closes the open reminder ────────────
-- Replaces 0080's posted-only triggers. Runs after any change to the posts list; if the gap is
-- now closed (a post went up, or one is now planned within two weeks), the reminder is done.
CREATE OR REPLACE FUNCTION on_social_post_changed() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF social_post_gap_ref() IS NULL THEN
    PERFORM social_post_close_reminders();
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS partnership_social_post_posted_ins ON partnership_social_posts;
DROP TRIGGER IF EXISTS partnership_social_post_posted_upd ON partnership_social_posts;
DROP TRIGGER IF EXISTS partnership_social_post_changed ON partnership_social_posts;
CREATE TRIGGER partnership_social_post_changed
  AFTER INSERT OR UPDATE OR DELETE ON partnership_social_posts
  FOR EACH STATEMENT EXECUTE FUNCTION on_social_post_changed();

-- ─── 5. New reminder owner takes over the open tasks ──────────────────
CREATE OR REPLACE FUNCTION on_recurring_setting_owner_changed() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE tasks SET assignee_id = NEW.owner_id, updated_at = now()
   WHERE source_system = 'crm'
     AND status <> 'done'
     AND CASE NEW.kind
           WHEN 'social_post' THEN source_ref LIKE 'social_post:reminder%'
           WHEN 'newsletter'  THEN source_ref LIKE 'comms:%'
           ELSE false
         END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partnership_recurring_settings_owner ON partnership_recurring_settings;
CREATE TRIGGER partnership_recurring_settings_owner
  AFTER UPDATE OF owner_id ON partnership_recurring_settings
  FOR EACH ROW WHEN (OLD.owner_id IS DISTINCT FROM NEW.owner_id)
  EXECUTE FUNCTION on_recurring_setting_owner_changed();
