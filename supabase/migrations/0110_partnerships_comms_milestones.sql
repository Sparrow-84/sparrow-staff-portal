-- Partnerships room: TSM production milestones (Contributor content due, Draft 1 → Susanna,
-- etc.) used to be hardcoded fixed-offset dates computed client-side purely for display —
-- nobody could fix a wrong date, and none of them ever generated a task for anyone. This
-- makes each milestone a real, editable row (date + owner only — Bethany doesn't rename or
-- add/remove milestones) that pushes its own task to its owner via the same daily reminder
-- engine as everything else in the room.

CREATE TABLE IF NOT EXISTS partnership_comms_milestones (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  comm_id    uuid        NOT NULL REFERENCES partnership_comms(id) ON DELETE CASCADE,
  label      text        NOT NULL,
  due_date   date        NOT NULL,
  owner_id   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  sort_order int         NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partnership_comms_milestones_comm_idx ON partnership_comms_milestones(comm_id);

ALTER TABLE partnership_comms_milestones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY partnership_comms_milestones_all ON partnership_comms_milestones
    FOR ALL TO authenticated
    USING (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Pushes a task to a milestone's owner once its date arrives — dedup-safe (stable
-- source_ref per milestone), same emit_system_task convention as every other reminder in
-- this room. Skips unassigned milestones (e.g. "Contributor content due" when nobody
-- Partnerships-access owns it) since there's no one to route the task to. Resolving is
-- just completing the task from Incoming Tasks like any other — no bespoke "done" state.
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

-- Fold into the existing daily dispatcher (0080) so this runs automatically, no separate cron.
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
  total := total + emit_comms_milestone_tasks();
  RETURN total;
END $$;
