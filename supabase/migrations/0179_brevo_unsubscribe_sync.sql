-- Brevo unsubscribe -> CRM auto-sync (Pending Decision from wasp-nest, greenlit 2026-09-12).
-- Mirrors the existing Givebutter webhook pattern (0088). When Brevo tells us a partner
-- unsubscribed from TSM, the new brevo-webhook Edge Function flips newsletter_subscribed
-- to false automatically AND records when it happened, so Partnerships Home can surface a
-- low-key "FYI" card (mirroring the existing "New contacts to review" card's tone — this is
-- not a to-do, nothing to act on) without anyone having to notice and fix it manually.
--
-- Two new columns rather than a separate events table: a partner can only meaningfully be
-- "recently unsubscribed, not yet acknowledged" once at a time, and comparing the two
-- timestamps (dismissed_at older than unsubscribed_at) naturally handles the case where
-- someone unsubscribes, gets acknowledged, resubscribes, then unsubscribes again later —
-- the card reappears because the new unsubscribe timestamp is newer than the old dismissal.

ALTER TABLE partners ADD COLUMN IF NOT EXISTS newsletter_unsubscribed_at timestamptz;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS newsletter_unsubscribe_dismissed_at timestamptz;

COMMENT ON COLUMN partners.newsletter_unsubscribed_at IS
  'Set by the brevo-webhook Edge Function when Brevo reports this partner unsubscribed from TSM. Null means no unsubscribe on record (or it predates this column).';
COMMENT ON COLUMN partners.newsletter_unsubscribe_dismissed_at IS
  'Set when a staffer dismisses the "FYI" card on Partnerships Home for this partner''s unsubscribe. The card re-shows if a later unsubscribe (newsletter_unsubscribed_at) is newer than this.';

-- Room-wide read: same access rule already governing every other partners SELECT.
-- No new RLS policy needed — the existing partnerships_has_access()-gated SELECT policy
-- on `partners` already covers these two columns.

-- Lets a staffer dismiss the FYI card without needing general partner-edit access beyond
-- what they already have via the existing partners UPDATE policy — no new RPC required,
-- a plain `.update({ newsletter_unsubscribe_dismissed_at: nowIso })` from the client works
-- under the existing partnerships_has_access() UPDATE policy.
