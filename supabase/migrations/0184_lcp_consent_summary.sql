-- Migration 0184: let LCP staff see a family's photo/story consent from the
-- family record itself, without needing stories_access.
--
-- Shelly's ask (Sept, see inbound-message-triage-2026-10 Batch 1 item 4):
-- a central place to check each participant's photo/story permissions,
-- ideally from the family's own info log. Today, story_layer2_consents is
-- only readable by staff with stories_access (a separate permission tier
-- from LCP's lcp_role) -- a plain client read from the LCP family record
-- would silently come back empty for any LCP-full staff member who doesn't
-- also happen to have stories_access. Same cross-boundary-read problem
-- already solved elsewhere in this codebase (see
-- fetch_lcp_move_in_request_detail, migration 0089) -- same fix: a narrow
-- SECURITY DEFINER function gated on the LCP side's own permission check
-- instead of widening story_layer2_consents' RLS.
--
-- Returns the full row shape (not a jsonb projection) so the client can
-- reuse the exact same TS type + helper functions (currentConsentFor,
-- isClearedToPublish) already written for the Stories & Media room --
-- no new parsing/business logic needed on either side.

CREATE OR REPLACE FUNCTION fetch_family_consent_summary(p_family_id uuid)
RETURNS SETOF story_layer2_consents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  IF NOT lcp_is_full() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT c.*
    FROM story_layer2_consents c
    JOIN lcp_household_adults a ON a.id = c.household_adult_id
    WHERE a.family_id = p_family_id
    ORDER BY COALESCE(c.date_signed, c.created_at::date) DESC;
END;
$$;
