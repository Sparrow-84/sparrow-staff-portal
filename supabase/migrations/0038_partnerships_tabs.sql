-- Sparrow Staff Portal — Partnerships Room tab tables
-- Adds: partnership_comms, partnership_collateral, partnership_social_posts,
--       partnership_events, partnership_connections, + overdue-followup emitter.
-- Run AFTER 0036_partnerships_reengaging_lapsed_tasks.sql.
-- All tables use IF NOT EXISTS; all types use DO/EXCEPTION; all functions CREATE OR REPLACE.

-- ─── partnership_comms ────────────────────────────────────────────────
-- Annual communications plan: each entry is one scheduled send (TSM edition,
-- annual report, Giving Tuesday, Christmas cards). Status cycles through
-- not_started → in_progress → sent. Financial asks are tracked against a 3-per-year cap.

DO $$ BEGIN
  CREATE TYPE comm_type AS ENUM (
    'tsm', 'tsm_easter', 'tsm_midyear', 'tsm_christmas',
    'annual_report', 'giving_tuesday', 'christmas_cards'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_status AS ENUM ('not_started', 'in_progress', 'sent');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS partnership_comms (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  year             int         NOT NULL,
  comm_type        comm_type   NOT NULL,
  title            text        NOT NULL,
  publish_date     date        NOT NULL,
  status           comm_status NOT NULL DEFAULT 'not_started',
  is_financial_ask boolean     NOT NULL DEFAULT false,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partnership_comms_year_idx ON partnership_comms(year, publish_date);

DROP TRIGGER IF EXISTS partnership_comms_updated_at ON partnership_comms;
CREATE TRIGGER partnership_comms_updated_at
  BEFORE UPDATE ON partnership_comms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE partnership_comms ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY partnership_comms_select ON partnership_comms
    FOR SELECT TO authenticated
    USING (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY partnership_comms_all ON partnership_comms
    FOR ALL TO authenticated
    USING (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── partnership_collateral ───────────────────────────────────────────
-- Physical and digital collateral inventory. Review cycles keep items fresh:
-- March = pre-spring mailing season; September = fall/year-end push; Both = both.

DO $$ BEGIN
  CREATE TYPE review_cycle AS ENUM ('march', 'sept', 'both');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS partnership_collateral (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name       text         NOT NULL,
  qty_on_hand     text,
  last_updated    date,
  review_cycle    review_cycle NOT NULL DEFAULT 'march',
  needs_attention boolean      NOT NULL DEFAULT false,
  notes           text,
  active          boolean      NOT NULL DEFAULT true,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS partnership_collateral_updated_at ON partnership_collateral;
CREATE TRIGGER partnership_collateral_updated_at
  BEFORE UPDATE ON partnership_collateral
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE partnership_collateral ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY partnership_collateral_select ON partnership_collateral
    FOR SELECT TO authenticated
    USING (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY partnership_collateral_all ON partnership_collateral
    FOR ALL TO authenticated
    USING (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── partnership_social_posts ─────────────────────────────────────────
-- Content calendar for Facebook and Instagram. Minimum frequency: every 14 days.
-- Planned → scheduled → posted; posted items roll into a collapsible history.

DO $$ BEGIN
  CREATE TYPE social_platform AS ENUM ('facebook', 'instagram', 'both');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE social_status AS ENUM ('planned', 'scheduled', 'posted');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS partnership_social_posts (
  id           uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  platform     social_platform NOT NULL DEFAULT 'both',
  content_idea text            NOT NULL,
  planned_date date,
  status       social_status   NOT NULL DEFAULT 'planned',
  notes        text,
  created_at   timestamptz     NOT NULL DEFAULT now(),
  updated_at   timestamptz     NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS partnership_social_posts_updated_at ON partnership_social_posts;
CREATE TRIGGER partnership_social_posts_updated_at
  BEFORE UPDATE ON partnership_social_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE partnership_social_posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY partnership_social_select ON partnership_social_posts
    FOR SELECT TO authenticated
    USING (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY partnership_social_all ON partnership_social_posts
    FOR ALL TO authenticated
    USING (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── partnership_events ───────────────────────────────────────────────
-- Log of community/networking events Sparrow staff attend. Each event can have
-- multiple meaningful connections logged against it.

CREATE TABLE IF NOT EXISTS partnership_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text        NOT NULL,
  event_date date        NOT NULL,
  location   text,
  attendees  text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partnership_events_date_idx ON partnership_events(event_date DESC);

ALTER TABLE partnership_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY partnership_events_select ON partnership_events
    FOR SELECT TO authenticated
    USING (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY partnership_events_all ON partnership_events
    FOR ALL TO authenticated
    USING (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── partnership_connections ──────────────────────────────────────────
-- Meaningful connections made at events — the people worth following up with.
-- When followup_due passes and followup_done is false, the spine pushes a task
-- to the caller's Triage Inbox via emit_overdue_connection_followups().

CREATE TABLE IF NOT EXISTS partnership_connections (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid        REFERENCES partnership_events(id) ON DELETE SET NULL,
  name           text        NOT NULL,
  organization   text,
  what_discussed text,
  next_action    text,
  followup_due   date,
  followup_done  boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partnership_connections_event_idx   ON partnership_connections(event_id);
CREATE INDEX IF NOT EXISTS partnership_connections_followup_idx ON partnership_connections(followup_due) WHERE followup_done = false;

DROP TRIGGER IF EXISTS partnership_connections_updated_at ON partnership_connections;
CREATE TRIGGER partnership_connections_updated_at
  BEFORE UPDATE ON partnership_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE partnership_connections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY partnership_connections_select ON partnership_connections
    FOR SELECT TO authenticated
    USING (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY partnership_connections_all ON partnership_connections
    FOR ALL TO authenticated
    USING (partnerships_has_access())
    WITH CHECK (partnerships_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── emit_overdue_connection_followups ───────────────────────────────
-- Mirrors emit_due_touchpoint_tasks() from 0008. For each connection where
-- followup_due has passed and followup_done is false, push a task to auth.uid()
-- (the partnerships caller who triggers the sweep on tab mount). Dedup-safe:
-- emit_system_task upserts on (source_system, source_ref).

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
    SELECT id, name, followup_due
    FROM   partnership_connections
    WHERE  followup_done = false
      AND  followup_due  < current_date
  LOOP
    PERFORM emit_system_task(
      'crm',
      'connection_followup:' || r.id,
      auth.uid(),
      'Follow up with ' || r.name,
      'partnerships'::department,
      'p2'::priority,
      r.followup_due
    );
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;
