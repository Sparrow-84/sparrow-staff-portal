-- Sparrow — LCP: goals, finance milestones, pre-session encouragement
-- Depends on: 0005_lcp.sql (lcp_units, families, profiles, lcp_has_access, current_family)
-- Safe to re-run: all tables use IF NOT EXISTS; column adds are guarded; types use DO/EXCEPTION.

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE goal_area AS ENUM ('spiritual', 'physical_financial', 'emotional', 'relational');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE goal_status AS ENUM ('active', 'met');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE goal_response AS ENUM ('met', 'needs_time');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Pre-session encouragement text (one per unit) ────────────────────────────

ALTER TABLE lcp_units
  ADD COLUMN IF NOT EXISTS encouragement_text text;

-- ─── Finance milestone definitions (lookup / seed table) ──────────────────────
-- These are program-wide, not per-family. Staff never edits these directly;
-- they seed during migration and are referenced by family progress records.

CREATE TABLE IF NOT EXISTS lcp_finance_milestones (
  id          serial      PRIMARY KEY,
  sort_order  int         NOT NULL,
  title       text        NOT NULL,
  description text        NOT NULL
);

-- Seed the 8 milestones (idempotent: skip if any rows already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lcp_finance_milestones LIMIT 1) THEN
    INSERT INTO lcp_finance_milestones (sort_order, title, description) VALUES
      (1,  'Track your spending',             'Keep all receipts for one full week — every coffee, every bill, every dollar.'),
      (2,  'Write it down',                   'Record every purchase. Seeing where money actually goes is the first step to deciding where it goes.'),
      (3,  'Build your first budget',         'Create a simple spending plan — income in, expenses out. It doesn''t have to be perfect.'),
      (4,  'Budget consistently',             'Follow your budget for a full month. Consistency matters more than perfection.'),
      (5,  'Check your credit score',         'Know your number. A credit score is just information — it''s not a judgment.'),
      (6,  'Banking 101',                     'Set up a checking and savings account if you don''t already have one. This is your financial foundation.'),
      (7,  'Make a debt plan',                'List what you owe and make a plan — even a small one. One step at a time.'),
      (8,  'Start saving',                    'Set aside any amount regularly. Even $5 a week builds the habit that changes everything.');
  END IF;
END $$;

-- ─── Finance milestone progress (per family) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS lcp_family_milestone_progress (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  milestone_id        int         NOT NULL REFERENCES lcp_finance_milestones(id) ON DELETE CASCADE,
  completed_at        timestamptz NOT NULL DEFAULT now(),
  completed_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (family_id, milestone_id)
);

ALTER TABLE lcp_family_milestone_progress ENABLE ROW LEVEL SECURITY;

-- Staff: full access
DO $$ BEGIN
  CREATE POLICY "lcp_staff_milestones_all"
    ON lcp_family_milestone_progress FOR ALL
    TO authenticated
    USING (lcp_has_access())
    WITH CHECK (lcp_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Family: read their own progress only
DO $$ BEGIN
  CREATE POLICY "family_milestones_select"
    ON lcp_family_milestone_progress FOR SELECT
    TO authenticated
    USING (family_id = current_family());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Goals ────────────────────────────────────────────────────────────────────
-- Staff-editable only. Participants can read and submit responses (separate table).

CREATE TABLE IF NOT EXISTS lcp_goals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  area         goal_area   NOT NULL,
  title        text        NOT NULL,
  due_date     date,
  status       goal_status NOT NULL DEFAULT 'active',
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  met_at       timestamptz
);

ALTER TABLE lcp_goals ENABLE ROW LEVEL SECURITY;

-- Staff: full access
DO $$ BEGIN
  CREATE POLICY "lcp_staff_goals_all"
    ON lcp_goals FOR ALL
    TO authenticated
    USING (lcp_has_access())
    WITH CHECK (lcp_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Family: read their own goals only (no INSERT/UPDATE/DELETE)
DO $$ BEGIN
  CREATE POLICY "family_goals_select"
    ON lcp_goals FOR SELECT
    TO authenticated
    USING (family_id = current_family());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Goal responses ───────────────────────────────────────────────────────────
-- Participant-submitted responses. Staff reads these to see "needs time" flags.
-- One response per family per goal per day (natural de-dup via unique on goal_id
-- + family_id since a goal only belongs to one family anyway).

CREATE TABLE IF NOT EXISTS lcp_goal_responses (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id      uuid          NOT NULL REFERENCES lcp_goals(id) ON DELETE CASCADE,
  family_id    uuid          NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  response     goal_response NOT NULL,
  note         text,
  created_at   timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE lcp_goal_responses ENABLE ROW LEVEL SECURITY;

-- Staff: read all responses for families they manage
DO $$ BEGIN
  CREATE POLICY "lcp_staff_goal_responses_all"
    ON lcp_goal_responses FOR ALL
    TO authenticated
    USING (lcp_has_access())
    WITH CHECK (lcp_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Family: insert and read their own responses
DO $$ BEGIN
  CREATE POLICY "family_goal_responses_insert"
    ON lcp_goal_responses FOR INSERT
    TO authenticated
    WITH CHECK (family_id = current_family());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "family_goal_responses_select"
    ON lcp_goal_responses FOR SELECT
    TO authenticated
    USING (family_id = current_family());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── updated_at trigger for lcp_goals ────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_lcp_goal_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER lcp_goals_updated_at
    BEFORE UPDATE ON lcp_goals
    FOR EACH ROW EXECUTE FUNCTION touch_lcp_goal_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;
