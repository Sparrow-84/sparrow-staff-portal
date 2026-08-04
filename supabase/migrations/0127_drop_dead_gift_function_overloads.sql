-- Cleanup, not a bug fix: migration 0115 added a p_gift_date parameter to
-- attach_gift_to_partner() and create_donor_partner_from_gift(), but
-- CREATE OR REPLACE FUNCTION with a different argument list creates a new
-- overload rather than replacing the old one -- so the pre-0115 signatures
-- have been sitting alongside the real ones ever since, unused. Confirmed
-- 2026-08-04 that the only real caller (supabase/functions/givebutter-webhook)
-- always passes p_gift_date, so the old overloads are genuinely dead code,
-- not a live bug. Dropping them so there's only ever one version of each
-- function to reason about.

drop function if exists attach_gift_to_partner(uuid, boolean);
drop function if exists create_donor_partner_from_gift(text, text, boolean, text);
