-- Partnerships room: new partner type "LCP referral partner" — an org that refers its
-- clients (people who come through its doors) to LCP as potential participants. Usually
-- added as a tag on an existing community/church partner rather than a main type.
-- Bethany builds and logs the relationship; Shelly uses the Directory's "LCP referrals"
-- filter + "Copy emails" to reach every referral org when an LCP house spot opens up.
-- Shows the Partnership terms / MOU section (frontend only — no column changes).
ALTER TYPE partner_type ADD VALUE IF NOT EXISTS 'lcp_referral' AFTER 'advisory';
