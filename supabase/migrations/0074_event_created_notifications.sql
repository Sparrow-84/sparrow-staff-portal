-- 0074_event_created_notifications.sql
-- New notification type so staff get pinged (with an inline Yes/No RSVP) whenever
-- a new All Staff meeting/event is posted — All Staff events default everyone to
-- "attending" and this makes the opt-out reachable right from the notification,
-- not just from inside the event.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_created';
