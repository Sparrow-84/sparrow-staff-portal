-- Migration 0121: Fix creator attribution on the two recurring LCP Session Cal
-- series (Monday Mentoring + LCP Group / Thursday Group Meeting).
--
-- Both series have created_by = Susanna's account on the lcp_events rows,
-- which the 0114 sync trigger faithfully copies onto their mirrored
-- calendar_events rows. That's wrong data, not a sync bug -- Shelly is the
-- one who actually runs these sessions. Because My Week's widget always
-- shows a dept event to whoever created it (regardless of RSVP status --
-- see WidgetHome.tsx), these two series were following Susanna onto her own
-- calendar even though she isn't LCP staff and isn't attending.
--
-- 0114's sync trigger only fires on INSERT or on UPDATE OF title/starts_at/
-- ends_at/location/recurrence_id (not created_by), so updating lcp_events
-- alone would not propagate here -- both tables need the same fix.
--
-- Scoped tightly by recurrence_id + the specific (wrong) created_by value so
-- this only touches the two known series and is a no-op if run twice.

UPDATE lcp_events
SET created_by = '2f74dc0f-1877-4d13-8598-9c9aec324642' -- Shelly
WHERE created_by = '546a6ce4-7792-41ec-b2e6-12dd70f8c6d7' -- Susanna
  AND recurrence_id IN (
    'e1f9f727-dfda-479f-bff6-11b30477d4e9', -- Monday Mentoring
    '70904ee8-b8ca-4a06-95fd-5c8b40d339ee'  -- LCP Group / Thursday Group Meeting
  );

UPDATE calendar_events
SET created_by = '2f74dc0f-1877-4d13-8598-9c9aec324642' -- Shelly
WHERE created_by = '546a6ce4-7792-41ec-b2e6-12dd70f8c6d7' -- Susanna
  AND source_system = 'lcp_session'
  AND recurrence_id IN (
    'e1f9f727-dfda-479f-bff6-11b30477d4e9',
    '70904ee8-b8ca-4a06-95fd-5c8b40d339ee'
  );
