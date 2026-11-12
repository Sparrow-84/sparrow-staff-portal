-- 0216: Resident Services, after the Nov 10 rollout with Resident Services + Partnerships staff.
--
-- 1. Where a service is available (resident_services.areas): Corvallis, Benton County, Linn
--    County, Lincoln County, Statewide (Philomath added to the list 2026-11-12; it's a text
--    column, so no database change for that). Several can be picked. Used by the room's location
--    filter, the printed handout and the website's "Where" filter.
-- 2. get_public_resources() also returns `areas` and `location_confidential`, so the website
--    can say "Call them for the location" only for a confidential location (a domestic
--    violence shelter) instead of for any service that has no address typed in. The
--    confidential address itself is still never returned.
-- 3. CARDV: the Directory record keeps the office line (541-758-0219, what Partnerships
--    uses). The number people in crisis call -- the 24-hour crisis and support line,
--    541-754-0110 -- goes on a Resident Services program, added as "waiting for review" under
--    CARDV's open review so the Resident Services room admin confirms it before it counts as
--    checked. Location confidential: it is never published or printed.
--
-- Safe to run more than once.

-- ─── 1. Areas ───────────────────────────────────────────────────────
ALTER TABLE resident_services ADD COLUMN IF NOT EXISTS areas text[] NOT NULL DEFAULT '{}';

-- ─── 2. Public list ─────────────────────────────────────────────────
-- The return columns change, so the function has to be dropped and recreated.
DROP FUNCTION IF EXISTS get_public_resources();
CREATE FUNCTION get_public_resources()
RETURNS TABLE (
  id uuid, provider text, service text, service_type text, serves text[],
  address text, help_phone text, hours text, how_to_access text, website text,
  last_checked_at timestamptz, areas text[], location_confidential boolean
)
  LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT s.id,
         COALESCE(p.name, s.provider_name),
         s.name, s.service_type, s.serves,
         CASE WHEN s.address_confidential THEN NULL ELSE s.address END,
         s.help_phone, s.hours, s.how_to_access,
         COALESCE(s.website, p.website),
         s.last_checked_at,
         s.areas,
         s.address_confidential
  FROM resident_services s
  LEFT JOIN partners p ON p.id = s.partner_id
  WHERE s.published_at IS NOT NULL
    AND s.archived_at IS NULL
    AND NOT s.needs_review
    AND s.last_checked_at >= now() - interval '2 years'
  ORDER BY s.service_type, COALESCE(p.name, s.provider_name), s.name;
$$;

REVOKE EXECUTE ON FUNCTION get_public_resources() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_resources() TO anon, authenticated;

-- ─── 3. CARDV's 24-hour crisis line ─────────────────────────────────
-- Only while CARDV's review (sent by 0213) is still open: the program waits in that review.
-- If the review was already closed, nothing is added -- the room admin adds it by hand.
INSERT INTO resident_services (
  partner_id, name, service_type, serves, areas, address, address_confidential,
  help_phone, hours, how_to_access, internal_notes, needs_review,
  last_checked_at, last_checked_by, last_checked_how
)
SELECT p.id,
       '24-hour crisis line and confidential shelter',
       'Shelter',
       ARRAY['All people'],
       ARRAY['Corvallis', 'Philomath', 'Benton County', 'Linn County'],
       NULL,
       true,
       '541-754-0110',
       '24 hours, every day',
       'Call the crisis line. CARDV decides who and when to give the shelter location to.',
       'Added by migration 0216. 541-754-0110 is the crisis line people call. The office line (541-758-0219) stays on the Directory record for Partnerships. Toll-free line also listed: 1-800-927-0197. Check who qualifies and which counties they serve before marking reviewed.',
       true,
       NULL, NULL, NULL
FROM partners p
WHERE p.id = '70e828cd-bf86-4219-a2aa-45a774e2e47e'
  AND EXISTS (
    SELECT 1 FROM resident_service_reviews r
    WHERE r.partner_id = p.id AND r.reviewed_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM resident_services s
    WHERE s.partner_id = p.id AND s.help_phone = '541-754-0110'
  );
