-- Karen Cornwell is an LCP volunteer and was never signed up as a prayer volunteer. Before
-- 0207 she was mis-tagged Volunteer → Prayer, so the Directory sync gave her a prayer
-- roster row; 0207 corrected her tag to LCP, and the sync then archived that row, which put
-- her under the Prayer Team tab's "No longer active". She shouldn't be on the Prayer Team
-- tab at all. Removes only her roster row, only while she isn't tagged Prayer and has no
-- prayer attendance (she had none as of 2026-11-05). Archiving stays the right outcome for
-- real prayer volunteers who are offboarded, so the sync itself is unchanged.
-- Idempotent: a no-op once applied.

DELETE FROM prayer_volunteers pv
USING partners p
WHERE pv.partner_id = p.id
  AND p.name = 'Karen Cornwell'
  AND NOT ('prayer' = ANY (p.volunteer_sub_categories))
  AND NOT EXISTS (SELECT 1 FROM prayer_attendance a WHERE a.volunteer_id = pv.id);
