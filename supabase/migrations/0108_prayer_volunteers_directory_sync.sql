-- Prayer volunteers becomes a mirror of Directory instead of a second place Bethany types
-- names into. A partner_id was already optional on prayer_volunteers (migration 0043) but
-- nothing enforced it — this adds the unique index needed so the app can safely upsert one
-- roster row per Directory partner (add a Prayer tag in Directory -> appears here; remove it
-- -> drops off the active roster; attendance history is untouched either way).
create unique index if not exists prayer_volunteers_partner_uniq
  on prayer_volunteers(partner_id) where partner_id is not null;
