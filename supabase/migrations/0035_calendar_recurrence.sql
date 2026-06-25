-- Adds recurrence_id to calendar_events so recurring series can be managed
-- as individual rows (same pattern as 0032_lcp_event_recurrence.sql).
-- All events in a series share one recurrence_id (a UUID generated client-side).
-- "Delete this and all future" filters by recurrence_id + starts_at >= anchor.

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurrence_id uuid;

CREATE INDEX IF NOT EXISTS calendar_events_recurrence_idx
  ON calendar_events(recurrence_id)
  WHERE recurrence_id IS NOT NULL;
