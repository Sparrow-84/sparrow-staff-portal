-- Migration 0039: Add show_on_org_calendar flag to lcp_events
-- Allows LCP staff to push individual events to the all-staff org calendar.

ALTER TABLE lcp_events
  ADD COLUMN IF NOT EXISTS show_on_org_calendar boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS lcp_events_org_cal_idx
  ON lcp_events(starts_at)
  WHERE show_on_org_calendar = true;
