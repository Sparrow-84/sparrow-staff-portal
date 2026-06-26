-- Partnerships Room v2 — schema additions and workflow automation.
-- Run AFTER 0036_partnerships_reengaging_lapsed_tasks.sql.
--
-- Adds:
--   a) Advisory partner type (individual strategic contributor)
--   b) Donor-specific columns: giving_method, newsletter_subscribed, first_gift_date
--   c) Community/church-specific columns: sparrow_provides, partner_provides
--   d) MOU status enum + column (community/church only)
--   e) Major donor workflow trigger → P1 exec call task + P2 owner notify task
--   f) Task completion trigger → when exec call done, P3 "review notes" to owner

-- ─── a) Advisory partner type ─────────────────────────────────────────
-- Advisory = individual who contributed strategic expertise or guidance.
-- Default cadence: 365 days (annual touch is the right rhythm for advisors).
ALTER TYPE partner_type ADD VALUE IF NOT EXISTS 'advisory' AFTER 'foundation';

-- ─── b) Donor-specific columns ────────────────────────────────────────
ALTER TABLE partners ADD COLUMN IF NOT EXISTS giving_method       text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS newsletter_subscribed boolean NOT NULL DEFAULT false;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS first_gift_date     date;

-- ─── c) Community/church-specific columns ─────────────────────────────
ALTER TABLE partners ADD COLUMN IF NOT EXISTS sparrow_provides    text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS partner_provides    text;

-- ─── d) MOU status ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE mou_status AS ENUM ('not_needed', 'needed', 'on_file');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE partners ADD COLUMN IF NOT EXISTS mou_status mou_status;

-- ─── e) Major donor workflow ──────────────────────────────────────────
-- When a partner's donor_tier is set to 'major' for the first time:
--   • Emit a P1 task to every active exec-department profile (Andrew's call within 72 hrs).
--     source_ref includes exec_id to satisfy the (source_system, source_ref) unique index
--     when there are multiple exec profiles.
--   • Emit a P2 task to the partner's owner (Bethany) to notify Andrew proactively.

CREATE OR REPLACE FUNCTION on_partner_major_donor() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  exec_rec record;
BEGIN
  FOR exec_rec IN
    SELECT id FROM profiles WHERE department = 'exec' AND active = true
  LOOP
    PERFORM emit_system_task(
      'crm',
      'major_donor_call:' || NEW.id::text || ':' || exec_rec.id::text,
      exec_rec.id,
      'Call new major donor — ' || NEW.name || ' (72 hrs)',
      'partnerships'::department,
      'p1'::priority,
      current_date + 3
    );
  END LOOP;

  IF NEW.owner_id IS NOT NULL THEN
    PERFORM emit_system_task(
      'crm',
      'major_donor_notify:' || NEW.id::text,
      NEW.owner_id,
      'Notify Andrew — ' || NEW.name || ' is now a major donor. He needs to call within 72 hrs.',
      'partnerships'::department,
      'p2'::priority,
      current_date + 1
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partner_major_donor ON partners;
CREATE TRIGGER partner_major_donor
  AFTER UPDATE ON partners
  FOR EACH ROW
  WHEN (NEW.donor_tier IS DISTINCT FROM OLD.donor_tier AND NEW.donor_tier = 'major')
  EXECUTE FUNCTION on_partner_major_donor();

-- ─── f) Task completion: exec called → awareness task to owner ────────
-- When the exec's "Call new major donor" task (source_ref = 'major_donor_call:<partner>:<exec>')
-- is marked done, emit a P3 awareness task to the partner's owner (Bethany) so she can
-- follow up and log notes.
-- source_ref format: 'major_donor_call:<partner_uuid>:<exec_uuid>'
-- split_part(..., ':', 2) extracts the partner UUID (UUIDs use hyphens, not colons).

CREATE OR REPLACE FUNCTION on_major_donor_call_reviewed() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  partner_uuid uuid;
  p            record;
BEGIN
  BEGIN
    partner_uuid := split_part(NEW.source_ref, ':', 2)::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  SELECT name, owner_id INTO p FROM partners WHERE id = partner_uuid;

  IF FOUND AND p.owner_id IS NOT NULL THEN
    PERFORM emit_system_task(
      'crm',
      'major_donor_reviewed:' || partner_uuid::text,
      p.owner_id,
      'Andrew called ' || p.name || ' — review notes in Partnerships',
      'partnerships'::department,
      'p3'::priority,
      current_date + 2
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS major_donor_call_done ON tasks;
CREATE TRIGGER major_donor_call_done
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (
    NEW.status = 'done'
    AND OLD.status IS DISTINCT FROM 'done'
    AND NEW.source_ref LIKE 'major_donor_call:%'
  )
  EXECUTE FUNCTION on_major_donor_call_reviewed();
