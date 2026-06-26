-- Migration 0040: LCP participant portal — inline content model
-- Adds inline text content to resources, completion tracking, and item ordering/locking.
-- Run AFTER 0039_lcp_show_on_org_calendar.sql.
--
-- Context: resources were originally Drive-links-only. The participant portal
-- now displays content inline (devotionals, worksheets) so participants never
-- leave the app. drive_url is relaxed to nullable; content-only resources
-- leave it null. Drive-linked resources can still use it as before.

-- ─── 1. lcp_resources: inline content + participant UX fields ─────────

-- drive_url was NOT NULL; relax so content-only resources don't need a link.
ALTER TABLE lcp_resources ALTER COLUMN drive_url DROP NOT NULL;

-- The actual text Shelly writes — devotional prose, reading passages, worksheet
-- questions. Displayed inline in the participant portal when present.
ALTER TABLE lcp_resources ADD COLUMN IF NOT EXISTS content          text;

-- Optional follow-up prompt. If set, participant sees a text area below the
-- content and submits a written response before marking done.
ALTER TABLE lcp_resources ADD COLUMN IF NOT EXISTS response_prompt  text;

-- Specific due date Shelly can set per resource. If null, the portal defaults
-- to Sunday midnight of the current calendar week.
ALTER TABLE lcp_resources ADD COLUMN IF NOT EXISTS due_date         date;

-- Staff-controlled lock: item appears in the participant's list but content
-- is hidden until a staff member flips this to false (e.g., discuss handout
-- in Monday's session first, then unlock Tuesday morning).
ALTER TABLE lcp_resources ADD COLUMN IF NOT EXISTS locked           boolean NOT NULL DEFAULT false;

-- Display order within a session. Resources and homework share a sort_order
-- space so Shelly can interleave them in the logical work-through sequence
-- (e.g., reading at 10, questionnaire at 20, unrelated homework at 30).
ALTER TABLE lcp_resources ADD COLUMN IF NOT EXISTS sort_order       int     NOT NULL DEFAULT 0;

-- ─── 2. lcp_homework: locking and ordering ────────────────────────────

-- Parallel staff-controlled lock for individual homework items.
ALTER TABLE lcp_homework ADD COLUMN IF NOT EXISTS locked            boolean NOT NULL DEFAULT false;

-- Same sort_order space as lcp_resources — staff sets these together when
-- planning the week so the combined list is in the right sequence.
ALTER TABLE lcp_homework ADD COLUMN IF NOT EXISTS sort_order        int     NOT NULL DEFAULT 0;

-- ─── 3. lcp_resource_completions ─────────────────────────────────────
-- One row per family per resource. Records when a participant finished reading
-- and (if response_prompt was set) what they wrote. Upsert-safe via the
-- unique constraint — re-submitting a response updates the existing row.

CREATE TABLE IF NOT EXISTS lcp_resource_completions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid        NOT NULL REFERENCES families(id)       ON DELETE CASCADE,
  resource_id   uuid        NOT NULL REFERENCES lcp_resources(id)  ON DELETE CASCADE,
  response_text text,
  completed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, resource_id)
);

CREATE INDEX IF NOT EXISTS lcp_rc_family_idx
  ON lcp_resource_completions(family_id);

ALTER TABLE lcp_resource_completions ENABLE ROW LEVEL SECURITY;

-- Family: full access to their own completions (read + write response).
DO $$ BEGIN
  CREATE POLICY lcp_rc_family ON lcp_resource_completions
    FOR ALL TO authenticated
    USING   (family_id = current_family())
    WITH CHECK (family_id = current_family());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- LCP staff: read all completions to review participant responses.
DO $$ BEGIN
  CREATE POLICY lcp_rc_staff_read ON lcp_resource_completions
    FOR SELECT TO authenticated
    USING (lcp_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
