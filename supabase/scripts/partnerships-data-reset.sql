-- Partnerships data reset — clears test data and imports real partner records.
-- Byron: run the verification SELECT first (Step 1), confirm it returns a row,
-- then run the full DO block (Step 2).
-- Safe to run more than once (full replace, not append).

-- ================================================================
-- STEP 1 — Verify Bethany's profile exists before running anything.
-- Run this SELECT alone first. It must return exactly one row.
-- If it returns nothing, stop — check: SELECT id, full_name FROM profiles;
-- ================================================================
-- SELECT id, full_name, email FROM profiles WHERE full_name ILIKE 'Bethany%';


-- ================================================================
-- STEP 2 — Wipe all test/seed data and import real records.
-- Only run this after Step 1 confirms Bethany's profile is found.
-- ================================================================

DO $$
DECLARE
  bid uuid;
BEGIN
  SELECT id INTO bid FROM profiles WHERE full_name ILIKE 'Bethany%' LIMIT 1;

  IF bid IS NULL THEN
    RAISE EXCEPTION
      'Bethany profile not found. Run: SELECT id, full_name FROM profiles; '
      'and find her name, then update the WHERE clause above.';
  END IF;

  -- ── Wipe all existing partner data ───────────────────────────
  DELETE FROM prayer_volunteers;
  DELETE FROM partner_touchpoints;
  DELETE FROM partners;


  -- ── CHURCH PARTNERS (6) ──────────────────────────────────────
  INSERT INTO partners (
    name, type, stage, owner_id,
    contact_name, phone, email, address,
    source, notes, cadence_days, last_touchpoint_at,
    newsletter_subscribed, active
  ) VALUES

  (
    'The Spring (The Hive)', 'church', 'active', bid,
    'Bond Nichols', '541-740-5185', 'bondcnichols@gmail.com', NULL,
    'Relational — Bethany/Susanna attend The Spring',
    'Corvallis, OR. Gives financially and provides volunteers. We have had some key volunteers come from The Spring and visit annually to share updates.',
    182, '2026-01-11'::timestamptz, false, true
  ),
  (
    'Corpus Christi (The Hive)', 'church', 'prospect', bid,
    'Samuel Stumbo', '541-941-9743', 'sjstumbo@gmail.com', NULL,
    'Relational — Hive church',
    'Philomath, OR. Gives financially and provides volunteers. Have not yet made a true formal partnership.',
    182, NULL, false, true
  ),
  (
    'Green Tree (The Hive)', 'church', 'active', bid,
    'Andy Bumstead', '541-325-3275', 'bumsteadandrew@yahoo.com', NULL,
    'Relational — Hive church',
    'Corvallis, OR. Gives financially. Green Tree values hands-on community service — historically enjoys large work days with their whole church.',
    182, NULL, false, true
  ),
  (
    'Brownsville Community Church', 'church', 'active', bid,
    'Andy Walton', '541-409-4497', 'lvf.realfood@gmail.com', 'PO Box 341, Brownsville, OR 97327',
    'Relational through Andrew & Shelly',
    'Brownsville, OR. Recurring donor. Provides volunteers. Andy and Pam Walton are the contacts. Has helped remodel a trailer for Homes of Hope, offered volunteers, and supported financially.',
    90, NULL, false, true
  ),
  (
    'Philomath Community Church', 'church', 'prospect', bid,
    'Scott Fairbanks', '541-990-6113', 'segullah@mac.com', '7225 SW Deerhaven Dr, Corvallis, OR 97333',
    'Relational — Scott is on Sparrow board',
    'Philomath, OR. Relationship is still developing — Bethany shared about Sparrow there in January 2026 and had great conversations with attendees.',
    182, '2026-01-25'::timestamptz, false, true
  ),
  (
    'Living Faith Community Church', 'church', 'prospect', bid,
    'Aaron Rutledge', '541-602-0107', NULL, NULL,
    'Relational — through Andrew & Bethany',
    'Philomath, OR.',
    182, NULL, false, true
  );


  -- ── COMMUNITY PARTNERS (4) ───────────────────────────────────
  INSERT INTO partners (
    name, type, stage, owner_id,
    contact_name, phone, email, address,
    source, notes, cadence_days,
    sparrow_provides, partner_provides, active
  ) VALUES

  (
    'C.H.A.N.C.E.', 'community', 'active', bid,
    NULL, NULL, NULL, NULL,
    NULL, NULL, 365,
    'Family program referrals',
    'Drug testing; family referrals to Sparrow',
    true
  ),
  (
    'Southside Youth Outreach', 'community', 'active', bid,
    'Noah Milbourn', '541-758-8131', 'noah.m@ssyocorvallis.org', NULL,
    NULL, NULL, 365,
    NULL, NULL, true
  ),
  (
    'Good News Club / Child Evangelism Fellowship', 'community', 'active', bid,
    'Collette Kuhl', NULL, NULL, NULL,
    NULL, NULL, 365,
    NULL, NULL, true
  ),
  (
    'Benton County Prayer Team', 'community', 'active', bid,
    'Peter Carlson', '541-936-2703', 'peter.a.carlson7@gmail.com', NULL,
    NULL, 'Bethany sends prayer points last Tuesday of each month.', 365,
    NULL, 'Prayer team prays for Sparrow at least monthly.',
    true
  );


  -- ── DONORS — ACTIVE ─────────────────────────────────────────
  INSERT INTO partners (
    name, type, stage, owner_id,
    email, phone, address,
    source, notes, cadence_days,
    last_touchpoint_at, newsletter_subscribed,
    donor_tier, first_gift_date, active
  ) VALUES

  (
    'Jennifer Caswell', 'donor', 'active', bid,
    'jennifer7815@gmail.com', '816-728-5814', '1213 Thurston St SE, Corvallis, OR 97322',
    'The Hive Communities', NULL, NULL,
    '2026-06-08'::timestamptz, false,
    'recurring', NULL, true
  ),
  (
    'Bryson Lewis', 'donor', 'active', bid,
    'bnist2006@gmail.com', '541-760-9964', '3170 NE Asbahr Ave, Corvallis, OR 97330',
    'The Hive Communities', NULL, NULL,
    '2026-06-08'::timestamptz, false,
    'first_time', '2025-12-18', true
  ),
  (
    'Samuel R Basden', 'donor', 'active', bid,
    'sam414basden@gmail.com', '587-590-6623', '169 Harvest Ridge Dr, Spruce Grove, AB T7x0e9',
    'Family / Susanna', 'Susanna''s brother.', NULL,
    '2026-06-08'::timestamptz, false,
    'first_time', '2026-01-17', true
  ),
  (
    'Scott & Elisa Fairbanks', 'donor', 'active', bid,
    'segullah@mac.com', '541-990-6113', '7225 SW Deerhaven Dr, Corvallis, OR 97333',
    'Board Member', NULL, NULL,
    '2026-06-12'::timestamptz, true,
    'recurring', NULL, true
  ),
  (
    'Mark & Heather Timmons', 'donor', 'active', bid,
    'mct1217@gmail.com', NULL, '536 Henshaw Dr, Brownsville, OR 97327',
    'Personal / Andrew & Shelly', NULL, NULL,
    '2026-06-17'::timestamptz, false,
    'recurring', NULL, true
  ),
  (
    'Jennifer Seagren', 'donor', 'active', bid,
    'bjseag@gmail.com', '971-354-9715', '3033 SE Jackson St, Albany, OR 97322',
    'Personal / Andrew & Shelly', NULL, NULL,
    '2026-06-12'::timestamptz, true,
    'first_time', NULL, true
  ),
  (
    'Jeremy Cook', 'donor', 'active', bid,
    'oregonplanting@gmail.com', '931-319-1732', '3608 SE Coral Reef PL, Corvallis, OR 97333',
    'Personal / Andrew & Shelly', NULL, NULL,
    NULL, true,
    'recurring', NULL, true
  ),
  (
    'Allen & Anita Yoder', 'donor', 'active', bid,
    'a2yoder@gmail.com', '541-771-6963', '5455 Davidson St SE, Albany, OR 97322',
    'Family / Andrew, Shelly & Bethany', 'Andrew & Shelly''s parents.', NULL,
    '2026-05-27'::timestamptz, true,
    'recurring', NULL, true
  ),
  (
    'Desert Streams Church', 'church', 'active', bid,
    NULL, NULL, '62010 27th St, Bend, OR 97701',
    'Personal / Andrew & Shelly', 'Church connection through the DOVE network, Hive oversight. Andrew outreach already done.', NULL,
    NULL, true,
    'major', NULL, true
  ),
  (
    'American Endowment Foundation — Barbra Devyldere', 'foundation', 'active', bid,
    NULL, NULL, NULL,
    'Personal / Andrew & Shelly', 'Major donation left from a friend of Andrew & Shelly''s after her death. Her son now manages the money.', NULL,
    NULL, false,
    'major', NULL, true
  ),
  (
    'Golan, LLC', 'donor', 'active', bid,
    NULL, NULL, '24617 Stovall Lane, Philomath, OR 97370',
    'Personal / Andrew & Shelly', 'Andrew''s business.', NULL,
    NULL, false,
    'recurring', NULL, true
  ),
  (
    'Heather Richter', 'donor', 'active', bid,
    'hrichter314@gmail.com', '541-745-9555', NULL,
    'Personal / Andrew & Shelly', NULL, NULL,
    '2026-05-27'::timestamptz, true,
    'recurring', NULL, true
  ),
  (
    'Juanita Weldon', 'donor', 'active', bid,
    'nita.weldon@gmail.com', '360-521-2415', NULL,
    'Family / Andrew, Shelly & Bethany', 'Andrew''s sister.', NULL,
    '2026-05-26'::timestamptz, true,
    'recurring', NULL, true
  ),
  (
    'Kaleb & Gabrielle McKay', 'donor', 'active', bid,
    'glhomer@yahoo.com', '541-788-2636', 'PO Box 714, Philomath, OR 97370',
    'The Hive Communities', 'Brought a work team on June 17, 2026. Gabe is passionate about nonprofits being financially sustainable rather than only relying on donations and volunteers. Very interested in the vision to build a new community.', NULL,
    '2026-06-17'::timestamptz, false,
    'recurring', NULL, true
  ),
  (
    'Thomas C Cope', 'donor', 'active', bid,
    NULL, NULL, '1411 31st Ave SE, Albany, OR 97322',
    NULL, 'Donated the money to purchase the RV that became the third LifeChange home. Andrew suggested giving him an update in late 2026 on the impact.', NULL,
    NULL, false,
    'first_time', '2026-01-02', true
  ),
  (
    'Aaron & Brenda Deneui', 'donor', 'active', bid,
    'brendasuzanned@gmail.com', NULL, '2091 Calico Loop, Ferndale, WA 98248',
    'Board Member', 'Second email on file: aarondeneui@protonmail.com. Last known giving: 2013.', NULL,
    NULL, false,
    NULL, NULL, true
  ),
  (
    'Anya Wenger', 'donor', 'active', bid,
    'anyawenger14@gmail.com', '971-213-8961', NULL,
    'Family / Andrew, Shelly & Bethany', 'Niece/cousin of Andrew & Shelly''s family. Also leads bimonthly Sparrow prayer meetings.', NULL,
    '2025-07-29'::timestamptz, true,
    'first_time', '2025-07-29', true
  ),
  (
    'Bright Funds', 'foundation', 'active', bid,
    NULL, NULL, NULL,
    'Personal / Andrew & Shelly', 'Past employer of John Weldon (Andrew/Shelly/Bethany family). Reached out for a letter from him.', NULL,
    NULL, false,
    'recurring', NULL, true
  ),
  (
    'CO Labor Ministries', 'community', 'active', bid,
    NULL, NULL, '31170 SW Country View Loop, Wilsonville, OR 97070',
    'Andrew / Shelly', 'This ministry prayed and prophesied over Andrew and Shelly in the context of Sparrow.', NULL,
    NULL, false,
    NULL, NULL, true
  ),
  (
    'Carol Pinkerton', 'donor', 'active', bid,
    'carolpinkerton4@gmail.com', '541-990-2591', '5331 Clay St SE, Apt 125, Albany, OR 97322',
    'The Hive Communities', NULL, NULL,
    NULL, true,
    'recurring', NULL, true
  ),
  (
    'Constance McEldowney', 'donor', 'active', bid,
    'conniemc1112@yahoo.com', NULL, '146 Carshalton Dr, Lyman, SC 29365',
    'Personal / Shelly', NULL, NULL,
    NULL, true,
    'recurring', NULL, true
  ),
  (
    'Corvallis Community Thrift Store', 'foundation', 'active', bid,
    NULL, NULL, NULL,
    'Grant Application', 'Grant from a local thrift store.', NULL,
    NULL, false,
    'first_time', NULL, true
  ),
  (
    'Delbert Martin', 'donor', 'active', bid,
    'dgskip@icloud.com', NULL, '3250 NW Norwood Dr, Corvallis, OR 97330',
    'Board Member', NULL, NULL,
    NULL, true,
    'first_time', '2025-03-23', true
  ),
  (
    'Don & Laura Gunther', 'donor', 'active', bid,
    'lauragunther1298@gmail.com', NULL, NULL,
    'Personal / Andrew & Shelly', NULL, NULL,
    NULL, true,
    'recurring', NULL, true
  ),
  (
    'Gizelle Marr', 'donor', 'active', bid,
    'gizelle.marr@mac.com', '971-237-3117', 'Redding, CA',
    'The Hive Communities', 'Email may not be valid.', NULL,
    NULL, true,
    'recurring', NULL, true
  ),
  (
    'Graham Seaders', 'donor', 'active', bid,
    'gseaders@gmail.com', '503-515-2358', NULL,
    'The Hive Communities', NULL, NULL,
    NULL, false,
    'first_time', '2021-01-05', true
  ),
  (
    'Hive Church', 'church', 'active', bid,
    NULL, NULL, '2555 NW Highland Dr, Corvallis, OR 97330',
    'The Hive Communities', NULL, NULL,
    NULL, false,
    'recurring', NULL, true
  ),
  (
    'Leroy & Patricia Yoder', 'donor', 'active', bid,
    'pittypat2@gmail.com', '503-779-3486', '2068 54th Ave, Albany, OR 97322',
    'Family / Andrew, Shelly & Bethany', 'Shelly''s great uncle and aunt. Second email: yoderl@gmail.com', NULL,
    NULL, false,
    'first_time', '2025-06-02', true
  ),
  (
    'John Winder', 'donor', 'active', bid,
    'jswinder@me.com', '541-231-5370', NULL,
    'The Hive Communities', NULL, NULL,
    NULL, true,
    'first_time', '2022-02-18', true
  ),
  (
    'Nessa Pfitzer', 'donor', 'active', bid,
    'nessamae@protonmail.com', '224-600-5680', NULL,
    'Family / Andrew, Shelly & Bethany', 'Niece/cousin of Andrew & Shelly''s family. Also an active prayer volunteer.', NULL,
    NULL, false,
    'first_time', '2025-01-18', true
  ),
  (
    'Oregon Housing & Community Development', 'foundation', 'active', bid,
    NULL, NULL, NULL,
    'Grant', 'Major grant that allowed Sparrow to acquire Twin Oaks park.', NULL,
    NULL, false,
    'major', NULL, true
  ),
  (
    'Richard Wenger', 'donor', 'active', bid,
    'rjohnwenger@gmail.com', '971-237-1302', '1605 College Street, Philomath, OR',
    'Family / Andrew, Shelly & Bethany', 'Andrew''s dad.', NULL,
    NULL, true,
    'recurring', NULL, true
  ),
  (
    'Ronald & Bonita Myer', 'donor', 'active', bid,
    'ron@ronmyer.com', NULL, '815 E Weavertown Rd, Myerstown, PA 17067',
    'The Hive Communities', 'DOVE USA oversight leaders for the Hive.', NULL,
    NULL, false,
    'first_time', '2025-12-30', true
  ),
  (
    'Ryan Steen', 'donor', 'active', bid,
    'ryansteen76@gmail.com', '541-829-8042', NULL,
    'The Hive Communities', NULL, NULL,
    NULL, true,
    'first_time', '2020-12-30', true
  ),
  (
    'Titus Wenger', 'donor', 'active', bid,
    'fullsailwithskipper@gmail.com', '541-609-1051', 'Indonesia',
    'Family / Andrew, Shelly & Bethany', 'Nephew/cousin of Andrew & Shelly''s family.', NULL,
    NULL, false,
    'recurring', NULL, true
  ),
  (
    'Larry & Susan Metzker', 'donor', 'active', bid,
    'weetreegal@comcast.net', NULL, NULL,
    NULL, NULL, NULL,
    NULL, true,
    NULL, NULL, true
  );


  -- ── DONORS — INACTIVE / DECEASED ────────────────────────────
  INSERT INTO partners (
    name, type, stage, owner_id,
    email, phone, address,
    source, notes,
    newsletter_subscribed, donor_tier, active
  ) VALUES

  (
    'Andre Auskaps', 'donor', 'inactive', bid,
    NULL, NULL, NULL,
    'Business / Andrew', 'Deceased. Major donor.',
    false, 'major', false
  ),
  (
    'Auskie Ag, LLC', 'donor', 'inactive', bid,
    NULL, NULL, NULL,
    NULL, 'Deceased.',
    false, NULL, false
  ),
  (
    'Ashley Sanders', 'donor', 'inactive', bid,
    NULL, NULL, NULL,
    NULL, 'No contact information available. Team does not know who she is.',
    false, NULL, false
  ),
  (
    'Michelle Cacka', 'donor', 'inactive', bid,
    NULL, NULL, NULL,
    NULL, 'No contact information. Team does not know who she is.',
    false, NULL, false
  );


  -- ── PRAYER-ONLY PARTNER RECORDS (2) ─────────────────────────
  INSERT INTO partners (
    name, type, stage, owner_id,
    email, phone, notes, active
  ) VALUES

  (
    'Kevin Nichols', 'prayer', 'active', bid,
    'happyravens@yahoo.com', '971-901-0009',
    'Committed intercessor: 10 minutes per day. Signed agreement on file. Also helps with work projects.',
    true
  ),
  (
    'Jenna Wenger', 'prayer', 'active', bid,
    'jenlmllr@gmail.com', '717-538-20336',
    'Attends prayer — no formal commitment. Signed agreement on file.',
    true
  );


  -- ── PRAYER VOLUNTEERS TABLE ──────────────────────────────────
  INSERT INTO prayer_volunteers (partner_id, full_name, email, phone, notes, active)
  VALUES
  (
    (SELECT id FROM partners WHERE name = 'Kevin Nichols'),
    'Kevin Nichols', 'happyravens@yahoo.com', '971-901-0009',
    'Committed intercessor: 10 minutes per day. Signed agreement on file. Last meeting attended: June 11, 2026. Also helps with work projects.',
    true
  ),
  (
    (SELECT id FROM partners WHERE name = 'Anya Wenger'),
    'Anya Wenger', 'anyawenger14@gmail.com', '971-213-8961',
    'Leading bimonthly Sparrow prayer meetings. Signed agreement on file. Last meeting attended: June 25, 2026.',
    true
  ),
  (
    (SELECT id FROM partners WHERE name = 'Nessa Pfitzer'),
    'Nessa Pfitzer', 'nessamae@protonmail.com', '224-600-5680',
    'Committed intercessor. No signed agreement on file yet.',
    true
  ),
  (
    (SELECT id FROM partners WHERE name = 'Jenna Wenger'),
    'Jenna Wenger', 'jenlmllr@gmail.com', '717-538-20336',
    'Attends prayer — no formal commitment. Signed agreement on file.',
    true
  );

  RAISE NOTICE 'Done. Partners inserted: %', (SELECT count(*) FROM partners);

END $$;

-- To verify after running:
-- SELECT type, stage, count(*) FROM partners GROUP BY type, stage ORDER BY type, stage;
-- SELECT count(*) FROM prayer_volunteers;
