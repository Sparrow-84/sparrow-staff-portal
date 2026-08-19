-- push_enabled defaulted to true (0067/0068) for every new profile/family,
-- regardless of whether anyone ever actually completed OneSignal's real
-- subscription flow -- so it's never been a trustworthy signal of "this
-- person can actually receive push," just "nobody's turned it off." Direct
-- check 2026-08-19: all 8 active profiles and all 3 active families show
-- push_enabled = true, but OneSignal itself confirms zero of the 3 families
-- have any live subscribed device. Existing rows are intentionally left
-- alone here -- the new check-push-subscription/-lcp functions self-correct
-- each person's own flag against OneSignal's real state the next time they
-- open Settings/Account, rather than a blind bulk flip that can't verify
-- anything on its own.

ALTER TABLE profiles ALTER COLUMN push_enabled SET DEFAULT false;
ALTER TABLE families ALTER COLUMN push_enabled SET DEFAULT false;
