-- 0066_push_notifications.sql
-- Adds push notification opt-out to profiles.
-- OneSignal targets users by their profile.id as External User ID — no player_id storage needed.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT true;
