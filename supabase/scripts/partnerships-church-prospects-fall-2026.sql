-- ================================================================
-- Sparrow Partnerships — Church Outreach List (Fall 2026) import
-- Source: "Church Outreach List — Fall 2026" (Bethany, September 2026)
-- Generated 2026-09-10
--
-- Adds 33 new church prospects (type='church', stage='prospect').
-- Living Faith Community Church deliberately left out — it's already
-- in the Directory from the 2026-06-30 import (contact Aaron Rutledge).
--
-- All records owned by Bethany (per the source doc + existing convention
-- of excluding department='exec' from ownership — Andrew's "initiates"
-- tag for two records is preserved in notes, not as owner_id). Love INC
-- affiliation is folded into notes rather than a dedicated field.
--
-- cadence_days = 90 (church default per src/components/partnerships/
-- AddPartnerPanel.tsx DEFAULT_CADENCE.church) and lead_time_days = 14
-- (DEFAULT_LEAD_TIME) are required NOT NULL columns as of migration 0080 —
-- both included on every row. Always editable in the app afterward.
--
-- Verify before running:
--   SELECT id, full_name, email FROM profiles WHERE full_name ILIKE 'Bethany%';
-- ================================================================

DO $$
DECLARE
  bid uuid;
BEGIN
  SELECT id INTO bid FROM profiles WHERE full_name ILIKE 'Bethany%' LIMIT 1;

  IF bid IS NULL THEN
    RAISE EXCEPTION 'Bethany profile not found — check profiles table before running this script';
  END IF;

  -- ── TIER 2 · FALL 2026 · BETHANY INITIATES (6) ──────────────────────────

  INSERT INTO partners (
    name, type, stage, owner_id,
    contact_name, phone, email, address,
    notes, cadence_days, lead_time_days, active
  ) VALUES

  (
    'New Life Fellowship', 'church', 'prospect', bid,
    'Rachel Profitt', '541-929-3114', 'rachelprofitt@yahoo.com', NULL,
    'Philomath, OR. Love INC partner. Tier 2 · Fall 2026 · Bethany initiates. Bethany knows Rachel through pastors prayer; Audrey attends. Rachel was installed September 2025 as a new pastor after 3 years without leadership, with a heart for community and women''s ministry. Two warm entry points — highest priority.',
    90, 14, true
  ),
  (
    'The Refuge', 'church', 'prospect', bid,
    'Gerry & Kim Alston', '541-929-7110', 'therefugephilomath@gmail.com', NULL,
    'Philomath, OR. Love INC partner. Tier 2 · Fall 2026 · Bethany initiates. Andrew met Gerry through shared street-outreach background. No formal Sparrow outreach yet — Bethany to initiate.',
    90, 14, true
  ),
  (
    'Northwest Hills Community Church', 'church', 'prospect', bid,
    'Josh Carstensen', '541-758-7688', 'josh@nwhills.com', NULL,
    'Corvallis, OR. Love INC partner — hosts Linen Closet. Tier 2 · Fall 2026 · Bethany initiates. Andrew and Bethany have both briefly met Josh through shared prayer gatherings. Appears on both Love INC and SouthSide partner lists — active community giving church. No formal Sparrow outreach.',
    90, 14, true
  ),
  (
    'Willamette Community Church', 'church', 'prospect', bid,
    'Scott Miller', '541-926-8881', 'wcc@wccalbany.com', NULL,
    'Albany, OR. Tier 2 · Fall 2026 · Bethany initiates. Andrew has spoken with Scott; Scott has heard of Sparrow. Founded 1867, large established church with Albany Christian School on site. Strongest Albany prospect by size and community orientation.',
    90, 14, true
  ),
  (
    'Hub City Church', 'church', 'prospect', bid,
    'Matt Campbell', '804-505-0482', 'info@albanyhubcity.com', NULL,
    'Albany, OR. Tier 2 · Fall 2026 · Bethany initiates. Deeply mission-focused; explicitly names Albany''s poverty statistics as their mission field. Strong values alignment. No prior relationship — moved up from the 2027 track.',
    90, 14, true
  ),
  (
    'Suburban Christian Church', 'church', 'prospect', bid,
    'Mike King & Kim Simmons', '541-753-2802', 'mike@suburbanchurch.com', NULL,
    'Corvallis, OR. Love INC partner — Tracy Lang in Love INC leadership. Tier 2 · Fall 2026 · Bethany initiates. Andrew knows Mike and Kim. Appeared across multiple community partner lists. Heavily invested in Love INC. Second contact email on file: kim@suburbanchurch.com. CAUTION: check with Susanna before reaching out — deep Love INC involvement.',
    90, 14, true
  );

  -- ── TIER 2 · FALL 2026 · ANDREW INITIATES (2) ───────────────────────────
  -- owner stays Bethany (department='exec' is excluded from Directory
  -- ownership per the 2026-07-18 fix) — "Andrew initiates" kept in notes.

  INSERT INTO partners (
    name, type, stage, owner_id,
    contact_name, phone, email, address,
    notes, cadence_days, lead_time_days, active
  ) VALUES

  (
    'Calvary Chapel Corvallis', 'church', 'prospect', bid,
    'Rob Verdeyen', '541-752-2851', 'office@calvarycorvallis.org', NULL,
    'Corvallis, OR. Love INC partner — hosts Firewood Ministry. Tier 2 · Fall 2026 · Andrew initiates. Andrew has connected with Rob a few times. Largest evangelical church in Corvallis; dedicated Outreach Coordinator on staff.',
    90, 14, true
  ),
  (
    'Eastside Christian Church', 'church', 'prospect', bid,
    'Charles Gascoigne', '541-928-9349', 'office@eccfamily.com', NULL,
    'Albany, OR. Tier 2 · Fall 2026 · Andrew initiates. Andrew met Charles at a prayer gathering and wants to get coffee — Andrew''s lane.',
    90, 14, true
  );

  -- ── TIER 3 · 2027 NEW RELATIONSHIP TRACK (5) ────────────────────────────

  INSERT INTO partners (
    name, type, stage, owner_id,
    contact_name, phone, email, address,
    notes, cadence_days, lead_time_days, active
  ) VALUES

  (
    'Grace City', 'church', 'prospect', bid,
    'Seth Trimmer', NULL, 'office@gracecitychurch.org', NULL,
    'Corvallis, OR. Love INC partner. Tier 3 · 2027 new relationship track. Larger congregation, two Sunday services. Active foster care support and outward-facing mission posture. No prior contact.',
    90, 14, true
  ),
  (
    'First Baptist Church of Corvallis', 'church', 'prospect', bid,
    'Barry Cole', '541-754-7211', 'office@fbccorvallis.org', NULL,
    'Corvallis, OR. Love INC partner — hosts Personal Hygiene Ministry. Tier 3 · 2027 new relationship track. Long history in Corvallis, multi-generational congregation. Also a SouthSide community partner. No prior contact.',
    90, 14, true
  ),
  (
    'Brownsville Christian Church', 'church', 'prospect', bid,
    'Bruce White', '541-466-3273', 'brucegwhite@gmail.com', NULL,
    'Brownsville, OR. Tier 3 · 2027 new relationship track. Audrey logged as new contact. Bruce is on the leadership team at Everyone Village (Eugene) — a Christian-led org serving formerly unhoused people. Direct mission alignment.',
    90, 14, true
  ),
  (
    'Jesus Pursuit', 'church', 'prospect', bid,
    'Emily Tedrow', '541-924-0883', 'info@jesuspursuit.org', NULL,
    'Albany, OR. Tier 3 · 2027 new relationship track. Andrew knows Emily well but has never discussed Sparrow with her. Good entry point through Andrew.',
    90, 14, true
  ),
  (
    'Redemption Church', 'church', 'prospect', bid,
    NULL, '541-757-7497', NULL, '1625 NW Grant Ave',
    'Corvallis, OR. Love INC partner. Tier 3 · 2027 new relationship track. Bible-teaching, community-oriented posture. No prior contact known.',
    90, 14, true
  );

  -- ── TIER 4 · KNOWN CONNECTIONS / LOWER PRIORITY (7) ─────────────────────

  INSERT INTO partners (
    name, type, stage, owner_id,
    contact_name, phone, email, address,
    notes, cadence_days, lead_time_days, active
  ) VALUES

  (
    'Valley Christian Center', 'church', 'prospect', bid,
    'Nicole Cade', '541-967-8712', 'nicholec@vccalbany.com', NULL,
    'Albany, OR. Tier 4 · Known connections / lower priority. Andrew knows Nicole. No Sparrow context established.',
    90, 14, true
  ),
  (
    'Northside Church', 'church', 'prospect', bid,
    'Jamey Mills', '541-497-7885', 'office@northside-albany.com', NULL,
    'Albany, OR. Love INC partner — hosts Bicycle Ministry. Tier 4 · Known connections / lower priority. Andrew knows attendees; Bethany met Jamey once outside a Sparrow context. No formal connection established.',
    90, 14, true
  ),
  (
    'Celebration Church Assembly of God', 'church', 'prospect', bid,
    'Jef Johnson', '541-760-1729', 'celebrate1corvallis@gmail.com', NULL,
    'Corvallis, OR. Tier 4 · Known connections / lower priority. Know the pastors well; had a prior Sparrow connection that has cooled. Already engaged with Unity Shelter.',
    90, 14, true
  ),
  (
    'Fairview Community Church', 'church', 'prospect', bid,
    NULL, NULL, NULL, NULL,
    'Corvallis area. Tier 4 · Known connections / lower priority. One meeting on record. Expressed interest in the community center build and offered manual labor when the time comes. Not interested in ongoing partnership at this stage — revisit when the build is imminent.',
    90, 14, true
  ),
  (
    'Pioneer Church', 'church', 'prospect', bid,
    'Jeremy', NULL, NULL, NULL,
    'Corvallis area. Love INC partner. Tier 4 · Known connections / lower priority. One meeting on record. Love to provide food; expressed interest but passed on the most recent opportunity. Good hook for a future specific food-related ask.',
    90, 14, true
  ),
  (
    'First Baptist Church of Brownsville', 'church', 'prospect', bid,
    'Michael Beach', NULL, NULL, NULL,
    'Brownsville, OR. Tier 4 · Known connections / lower priority. Audrey logged as new contact. No prior Sparrow relationship.',
    90, 14, true
  ),
  (
    'Corvallis Evangelical Church (Compassion Church)', 'church', 'prospect', bid,
    NULL, NULL, NULL, NULL,
    'Corvallis, OR. Love INC partner. Tier 4 · Known connections / lower priority. Met assistant pastor at some point. Already engaged with Unity Shelter. No named contact currently on record.',
    90, 14, true
  );

  -- ── TIER 5 · COLD / SPREADSHEET CONTACTS (13) ───────────────────────────

  INSERT INTO partners (
    name, type, stage, owner_id,
    contact_name, phone, email, address,
    notes, cadence_days, lead_time_days, active
  ) VALUES

  (
    'Brownsville Mennonite Church', 'church', 'prospect', bid,
    'Kevin Baker', '541-466-3273', NULL, NULL,
    'Brownsville, OR. Tier 5 · Cold / spreadsheet contacts. Teresa attends; Andrew has met Kevin. No Sparrow context established.',
    90, 14, true
  ),
  (
    'Central Valley Church', 'church', 'prospect', bid,
    'Jeff Carter', '503-602-6796', NULL, NULL,
    'Halsey, OR. Tier 5 · Cold / spreadsheet contacts. Audrey logged as new contact. No prior Sparrow relationship.',
    90, 14, true
  ),
  (
    'Kings Circle Church', 'church', 'prospect', bid,
    'Frank Montgomery / Mindy Droke', '541-757-9080', 'info@kingscircle.church', NULL,
    'Corvallis, OR. Love INC partner. Tier 5 · Cold / spreadsheet contacts. Community-minded. No prior contact.',
    90, 14, true
  ),
  (
    'The Branch', 'church', 'prospect', bid,
    'Doug Payne', '541-604-8468', 'info@thebranchcorvallis.org', NULL,
    'Corvallis, OR. Love INC partner. Tier 5 · Cold / spreadsheet contacts. Smaller, gospel-centered church. No prior contact.',
    90, 14, true
  ),
  (
    'Fairview Mennonite Church', 'church', 'prospect', bid,
    'Brandon Funk', '541-928-1067', 'dennis@fairviewmennonite.com', NULL,
    'Albany, OR. Tier 5 · Cold / spreadsheet contacts. On spreadsheet. No prior contact known. (Email on file — dennis@fairviewmennonite.com — as given for contact Brandon Funk; may be a shared/office address, worth confirming.)',
    90, 14, true
  ),
  (
    'Halsey Mennonite Church', 'church', 'prospect', bid,
    'Dan Weaver', '541-220-7083', NULL, NULL,
    'Halsey, OR. Tier 5 · Cold / spreadsheet contacts. On spreadsheet. No prior contact known.',
    90, 14, true
  ),
  (
    'Valley Springs Church', 'church', 'prospect', bid,
    NULL, NULL, NULL, '968 NW Circle Blvd',
    'Corvallis, OR. Tier 5 · Cold / spreadsheet contacts. Bible-based, multi-ethnic, multi-generational church founded 2015. No prior contact.',
    90, 14, true
  ),
  (
    'Philomath Church of the Nazarene', 'church', 'prospect', bid,
    NULL, NULL, NULL, NULL,
    'Philomath, OR. Tier 5 · Cold / spreadsheet contacts. Holiness evangelical denomination with a strong tradition of compassion ministry. No prior contact.',
    90, 14, true
  ),
  (
    'Potter''s House', 'church', 'prospect', bid,
    NULL, NULL, NULL, NULL,
    'Corvallis, OR. Tier 5 · Cold / spreadsheet contacts. On spreadsheet; no contact info or prior relationship known.',
    90, 14, true
  ),
  (
    'The Shift', 'church', 'prospect', bid,
    'Neal McKinney', '541-791-9356', 'neal@discovertheshift.com', NULL,
    'Albany, OR. Tier 5 · Cold / spreadsheet contacts. On spreadsheet. No prior contact known.',
    90, 14, true
  ),
  (
    'City Church', 'church', 'prospect', bid,
    'Josh Conn', '541-926-4762', 'josh@albanycitychurch.org', NULL,
    'Albany, OR. Tier 5 · Cold / spreadsheet contacts. On spreadsheet. No prior contact known.',
    90, 14, true
  ),
  (
    'Verbatim Church', 'church', 'prospect', bid,
    'Tanner Furgeson', '541-248-3369', 'info@verbatim.church', NULL,
    'Albany, OR. Tier 5 · Cold / spreadsheet contacts. On spreadsheet. No prior contact known.',
    90, 14, true
  ),
  (
    'Corvallis Korean Church', 'church', 'prospect', bid,
    NULL, '541-753-9643', 'corvalliskoreanchurch@gmail.com', NULL,
    'Corvallis, OR. Tier 5 · Cold / spreadsheet contacts. On spreadsheet. No prior contact known.',
    90, 14, true
  );

END $$;
