-- Add recurrence_id to lcp_events so recurring series can be identified and managed together
ALTER TABLE lcp_events
  ADD COLUMN IF NOT EXISTS recurrence_id uuid;
