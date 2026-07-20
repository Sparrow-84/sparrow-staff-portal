-- Sparrow — Stories & Media room: fix admin access
-- Bug found during Susanna's first real test: every profile has stories_access
-- = false (nobody's flag was ever turned on), and the room's RLS policies only
-- ever checked that flag — no admin bypass. The app's own nav already assumes
-- admins get in automatically (`isAdmin || profile.stories_access` in
-- AppShell.tsx), same pattern as every other room (can_see_residents(),
-- lcp_has_access(), partnerships_has_access() all include role = 'admin').
-- The database rule never matched that — so admins could open the room but
-- every write was silently rejected. This adds the same admin bypass at the
-- database level.
-- Depends on: 0081_stories_room.sql
-- Safe to re-run: CREATE OR REPLACE / DROP+CREATE POLICY are both idempotent.

CREATE OR REPLACE FUNCTION stories_has_access() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (role = 'admin' OR stories_access)
  );
$$;

DROP POLICY IF EXISTS "stories_room_access" ON stories;
CREATE POLICY "stories_room_access" ON stories
  FOR ALL TO authenticated
  USING (stories_has_access())
  WITH CHECK (stories_has_access());

DROP POLICY IF EXISTS "story_media_events_access" ON story_media_events;
CREATE POLICY "story_media_events_access" ON story_media_events
  FOR ALL TO authenticated
  USING (stories_has_access())
  WITH CHECK (stories_has_access());

DROP POLICY IF EXISTS "story_layer2_consents_access" ON story_layer2_consents;
CREATE POLICY "story_layer2_consents_access" ON story_layer2_consents
  FOR ALL TO authenticated
  USING (stories_has_access())
  WITH CHECK (stories_has_access());
