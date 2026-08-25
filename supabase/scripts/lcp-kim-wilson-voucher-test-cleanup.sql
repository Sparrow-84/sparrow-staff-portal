-- Sparrow — LCP: removes Audrey's 2 test vouchers from Kim Wilson's family
-- (aff68a95-1313-4516-90c4-530ae51dd4d8), added 2026-08-25 to see how the
-- Vouchers screen looks, and unwinds the redemption they got swept into.
--
-- Kim had 1 real voucher (earned 2026-08-12 for Monday Mentoring attendance,
-- awarded by Shelly) sitting unredeemed. Audrey's 2 test vouchers (earned
-- today, "On-time attendance + homework") got added alongside it, and an
-- in-app "redeem in person" test then bundled all 3 together into one
-- fulfilled $25 gift-card redemption (id 0a0a4f82-8448-477c-878b-390cc1db1687).
--
-- Per Susanna: wipe just the 2 test vouchers -- Kim keeps credit for the
-- real one. Since all 3 share that one redemption row, this: deletes the
-- redemption itself (it was never a real gift card, so nothing to preserve
-- there), deletes the 2 test voucher rows, and puts the real voucher back
-- to unredeemed (redemption_id = null) so Kim's earned credit isn't lost.
--
-- Safe to re-run: every statement is scoped to these specific ids, and
-- becomes a no-op once already applied.

delete from lcp_redemptions
where id = '0a0a4f82-8448-477c-878b-390cc1db1687';

delete from lcp_vouchers
where id in ('d209308a-a10a-4990-b7bf-d9f24f98217f', '7bce6870-b80c-441d-a3e3-d4c4f248de2a');

update lcp_vouchers
set redemption_id = null
where id = 'f7d1ec47-85d5-46a1-b0a5-f4ef158fab87';
