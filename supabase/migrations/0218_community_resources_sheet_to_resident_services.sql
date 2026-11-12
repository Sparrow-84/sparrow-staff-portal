-- 0218: The Community Resources sheet Resident Services hands out -> Directory + Resident
-- Services "To review", with the programs on it already drafted so the room admin checks
-- them instead of typing them in. Asked for 2026-11-11.
--
-- The sheet is a phone list (name + number), no addresses or hours. Triage:
--   * Resident services on it: 21 lines -> 15 organizations, 17 draft programs, plus 4 more
--     CSC programs added 2026-11-12 (21 drafts in all).
--       - 9 organizations already in the Directory (Benton County Health Department, C.H.A.N.C.E.,
--         CARDV, DevNW, Love Inc, Oregon DHS, St. Vincent de Paul (Corvallis), Vina Moses Center,
--         We Care Benton County). The sheet line goes in their notes; a phone is only filled in
--         where the record has none.
--       - (Updated 2026-11-12 from the newer Word copy of the sheet: CSC's main line
--         541-752-1010 added; Love INC: both numbers work.)
--       - 6 new Community Partner prospects: Samaritan Health Services, The Corvallis Clinic
--         (business), Philomath Community Services (runs the Gleaners), South Corvallis Food
--         Bank, Oregon Cascades West Council of Governments (Meals on Wheels), Community
--         Services Consortium.
--   * Duplicates folded:
--       - "DHS" and "Child/Adult Protective Services" have the same number (1-855-503-7233,
--         the Oregon DHS abuse reporting line): one program.
--       - OHP and SNAP share 1-800-699-9075 (the state's ONE line): two programs under
--         Oregon DHS so each shows under its own type (Health / Food), same number.
--       - "Benton County Mental Health" is part of Benton County Health Department.
--       - CARDV: no new program. 0216 already adds its 24-hour crisis line. The sheet's
--         541-738-8319 couldn't be matched to CARDV anywhere, so it's only noted.
--   * Numbers that disagree with the Directory or public listings are kept as Resident
--     Services' sheet has them and flagged in the program's staff notes, for checking.
--   * Left out for now (not services a resident gets; waiting on Susanna's call): 911, the
--     Sheriff / police / fire / animal control / jail / records / fax / city hall /
--     courthouse / chamber numbers, the library, the post office and the 6 utilities.
--
-- Every draft program waits in its organization's review (needs_review) and is "checked"
-- only when the room admin clicks "Reviewed — this is correct". The room admin gets ONE task
-- for the batch, not one per organization.
--
-- Depends on 0199/0200/0206/0216 (areas). Safe to re-run: organizations match by id or name,
-- notes by their heading, reviews by the one-open-review index, programs by organization +
-- name + phone, the task by its ref. Runs outside the app (auth.uid() is null).

CREATE OR REPLACE FUNCTION pg_temp.rs_org(
  p_existing uuid, p_name text, p_sub text, p_phone text, p_note text
) RETURNS uuid
  LANGUAGE plpgsql AS $$
DECLARE
  v_partner uuid := p_existing;
  v_block text := 'From the Community Resources sheet Resident Services hands out (added Nov 2026):' || E'\n' || p_note;
BEGIN
  IF v_partner IS NULL THEN
    SELECT id INTO v_partner FROM partners WHERE lower(name) = lower(p_name) LIMIT 1;
  END IF;

  IF v_partner IS NULL THEN
    INSERT INTO partners (name, type, sub_category, stage, owner_id, source, phone)
    VALUES (p_name, 'community', p_sub::partner_sub_category, 'prospect',
            (SELECT id FROM profiles WHERE full_name = 'Bethany' AND active LIMIT 1),
            'Resident Services Community Resources sheet (2026)', p_phone)
    RETURNING id INTO v_partner;
  ELSE
    UPDATE partners SET phone = COALESCE(nullif(trim(phone), ''), p_phone) WHERE id = v_partner;
  END IF;

  UPDATE partners
     SET notes = CASE WHEN nullif(trim(notes), '') IS NULL THEN v_block ELSE notes || E'\n\n' || v_block END
   WHERE id = v_partner
     AND position('From the Community Resources sheet Resident Services hands out' IN coalesce(notes, '')) = 0;

  INSERT INTO resident_service_reviews (partner_id, sent_by)
  VALUES (v_partner, (SELECT id FROM profiles WHERE full_name = 'Susanna' LIMIT 1))
  ON CONFLICT (partner_id) WHERE reviewed_at IS NULL DO NOTHING;

  RETURN v_partner;
END $$;

-- A draft program inside the organization's open review. Skipped if the organization
-- already has this program (same name, or same phone and type), or if its review was
-- already closed.
CREATE OR REPLACE FUNCTION pg_temp.rs_draft(
  p_partner uuid, p_name text, p_type text, p_serves text[], p_areas text[],
  p_phone text, p_first_steps text, p_staff_note text
) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM resident_service_reviews WHERE partner_id = p_partner AND reviewed_at IS NULL) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM resident_services
     WHERE partner_id = p_partner AND archived_at IS NULL
       AND (lower(name) = lower(p_name)
            OR (regexp_replace(coalesce(help_phone, ''), '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
                AND service_type = p_type))
  ) THEN
    RETURN;
  END IF;
  INSERT INTO resident_services (
    partner_id, name, service_type, serves, areas, help_phone, how_to_access, internal_notes,
    needs_review, last_checked_at, last_checked_by, last_checked_how
  ) VALUES (
    p_partner, p_name, p_type, p_serves, p_areas, p_phone, p_first_steps,
    'From the Community Resources sheet (Nov 2026). Check who it serves, the address, hours and first steps.'
      || CASE WHEN p_staff_note IS NOT NULL THEN ' ' || p_staff_note ELSE '' END,
    true, NULL, NULL, NULL
  );
END $$;

DO $$
DECLARE
  a record;
  v_open int;
  v uuid;
  all_people text[] := ARRAY['All people'];
  -- Corvallis is listed too: picking Corvallis in the filter only shows programs tagged Corvallis.
  local3 text[] := ARRAY['Corvallis', 'Benton County', 'Linn County', 'Lincoln County'];
BEGIN
  ALTER TABLE resident_service_reviews DISABLE TRIGGER resident_service_reviews_emit;

  -- ── Already in the Directory ──────────────────────────────────────
  v := pg_temp.rs_org('24c54aea-45ef-46e6-84a2-a19f787f27ca', 'Benton County Health Department', 'nonprofit', NULL,
    'Benton County Mental Health: 541-766-6835, or after hours 1(888) 232-7192.');
  PERFORM pg_temp.rs_draft(v, 'Mental health (Benton County Behavioral Health)', 'Health', all_people,
    ARRAY['Corvallis', 'Benton County'], '541-766-6835',
    'Call during business hours. After hours or in a crisis, call 1-888-232-7192.',
    'The county says to call 541-766-6767 to check whether someone is eligible for services; 541-766-6835 is the main line.');

  v := pg_temp.rs_org('7bd39678-6d6b-47ce-939f-7481732a39b0', 'C.H.A.N.C.E.', 'nonprofit', NULL,
    'C.H.A.N.C.E. (of Corvallis / Benton County) (Alcohol/Drugs): 541-791-3411.');
  PERFORM pg_temp.rs_draft(v, 'Recovery support (alcohol and drugs)', 'Recovery', all_people, local3,
    '541-791-3411', NULL,
    'The Directory record has 541-968-9803; public listings (211) give 541-791-3411, the number on the sheet.');

  PERFORM pg_temp.rs_org('70e828cd-bf86-4219-a2aa-45a774e2e47e', 'CARDV', 'nonprofit', NULL,
    'CARDV (Domestic Violence): 541-738-8319 on the sheet. Not found in any public listing for CARDV; their 24-hour crisis line is 541-754-0110 and office line 541-758-0219.');

  v := pg_temp.rs_org('9be8aab7-7718-449e-89d5-9d6d8f383dd1', 'DevNW', 'nonprofit', '541-752-7220',
    'DevNW: 541-752-7220.');
  PERFORM pg_temp.rs_draft(v, 'Homeownership and financial coaching', 'Housing', all_people, local3,
    '541-752-7220', NULL, NULL);

  v := pg_temp.rs_org('4093aa1b-8bfa-4187-a58c-57e8901e8b99', 'Love Inc', 'nonprofit', '541-757-8111',
    'Love INC: 541-286-4731 on the sheet; their website lists the helpline, 541-757-8111 (Mon-Thu 9:30am-1:30pm). Resident Services confirmed (Nov 12) that both numbers work.');
  PERFORM pg_temp.rs_draft(v, 'Help line (connects people with local church help)', 'Other', all_people,
    ARRAY['Corvallis', 'Benton County'], '541-757-8111', NULL,
    'Either number works (confirmed by Resident Services Nov 12): helpline 541-757-8111 (Mon-Thu 9:30am-1:30pm) or 541-286-4731.');

  v := pg_temp.rs_org('5de92891-7dd9-46d7-bb15-fc695a545e33', 'Oregon Department of Human Services (DHS)', 'nonprofit', NULL,
    'OHP (Oregon Health Plan): 1(800) 699-9075. SNAP (Food Stamps): 1(800) 699-9075. DHS (Department of Human Services): 1(855) 503-7233. Child/Adult Protective Services: 1(855) 503-7233. Senior Disability Services: 1(855) 673-2372.');
  PERFORM pg_temp.rs_draft(v, 'Oregon Health Plan (OHP)', 'Health', all_people, ARRAY['Statewide'],
    '1-800-699-9075', 'Call to apply or ask about coverage.', 'Same number as SNAP: it is the state''s ONE line for both.');
  PERFORM pg_temp.rs_draft(v, 'SNAP food benefits', 'Food', all_people, ARRAY['Statewide'],
    '1-800-699-9075', 'Call to apply.', 'Same number as OHP: it is the state''s ONE line for both.');
  PERFORM pg_temp.rs_draft(v, 'Report abuse (Child and Adult Protective Services)', 'Other', all_people, ARRAY['Statewide'],
    '1-855-503-7233', 'Call any time to report abuse of a child or an adult.',
    'The sheet lists this number for both "DHS" and "Child/Adult Protective Services"; it is the Oregon DHS abuse reporting line, so it is one program here.');
  PERFORM pg_temp.rs_draft(v, 'Aging and Disability Resource Connection (ADRC)', 'Disability help',
    ARRAY['Seniors', 'People with disabilities', 'Veterans'], ARRAY['Statewide'],
    '1-855-673-2372', NULL, 'Listed on the sheet as "Senior Disability Services". 1-855-673-2372 is the statewide ADRC line.');

  v := pg_temp.rs_org('d5a2369a-0fe2-442a-a81a-d918474f7f23', 'St. Vincent de Paul (Corvallis)', 'nonprofit', NULL,
    'St Vincent DePaul: 541-757-1988.');
  PERFORM pg_temp.rs_draft(v, 'Emergency help with rent and utilities', 'Financial', all_people,
    ARRAY['Corvallis', 'Benton County'], '541-757-1988', NULL,
    'The sheet''s 541-757-1988 is listed publicly as St. Mary''s Catholic Church, which hosts St. Vincent de Paul. The Directory record has 541-286-4183, their thrift store and food pantry line.');

  v := pg_temp.rs_org('3a626a5f-6967-4d07-a011-f35e188452d6', 'Vina Moses Center', 'nonprofit', NULL,
    'Vina Moses: 541-753-1420.');
  PERFORM pg_temp.rs_draft(v, 'Clothing and household help', 'Other', all_people,
    ARRAY['Corvallis', 'Benton County'], '541-753-1420', NULL,
    '541-753-1420 is the main line. Help with rent, utilities and prescriptions goes through their intake line, 541-752-4688 (211info).');

  v := pg_temp.rs_org('20168986-9219-4b93-b873-cc7768794b34', 'We Care Benton County', 'nonprofit', NULL,
    'We Care (Emergency Services): 541-203-0102.');
  PERFORM pg_temp.rs_draft(v, 'Emergency financial help', 'Financial', all_people,
    ARRAY['Corvallis', 'Benton County'], '541-203-0102', NULL, NULL);

  -- ── New to the Directory ──────────────────────────────────────────
  v := pg_temp.rs_org(NULL, 'Samaritan Health Services', 'nonprofit', '541-768-5111',
    'Samaritan Health Services: 541-757-5111 on the sheet, which is wrong. Good Samaritan Regional Medical Center''s main line is 541-768-5111 (samhealth.org).');
  PERFORM pg_temp.rs_draft(v, 'Hospital and clinics', 'Health', all_people, local3, '541-768-5111', NULL,
    'The sheet had 541-757-5111, which is wrong; 541-768-5111 is Good Samaritan Regional Medical Center''s main line.');

  v := pg_temp.rs_org(NULL, 'The Corvallis Clinic', 'business', '541-754-1150',
    'The Corvallis Clinic: 541-754-1150.');
  PERFORM pg_temp.rs_draft(v, 'Medical clinic', 'Health', all_people, ARRAY['Corvallis', 'Benton County'], '541-754-1150', NULL, NULL);

  v := pg_temp.rs_org(NULL, 'Philomath Community Services', 'nonprofit', '541-929-2499',
    'Gleaners: 541-929-2499. That is the main line for Philomath Community Services, which runs the Philomath Community Gleaners (and a food bank and baby bank).');
  PERFORM pg_temp.rs_draft(v, 'Philomath Community Gleaners', 'Food', all_people, ARRAY['Benton County'], '541-929-2499', NULL,
    'Listed on the sheet just as "Gleaners".');

  v := pg_temp.rs_org(NULL, 'South Corvallis Food Bank', 'nonprofit', '541-753-4263',
    'South Corvallis Food Bank: 541-753-4263.');
  PERFORM pg_temp.rs_draft(v, 'Food pantry', 'Food', all_people, ARRAY['Corvallis', 'Benton County'], '541-753-4263', NULL, NULL);

  v := pg_temp.rs_org(NULL, 'Oregon Cascades West Council of Governments (OCWCOG)', 'nonprofit', '541-967-8630',
    'Meals on Wheels: 541-967-8630.');
  PERFORM pg_temp.rs_draft(v, 'Meals on Wheels', 'Food', ARRAY['Seniors', 'People with disabilities'],
    ARRAY['Benton County', 'Linn County'], '541-967-8630', NULL,
    '541-967-8630 is also listed publicly as OCWCOG''s Senior and Disability Services line for Benton and Linn; check which program it reaches.');

  v := pg_temp.rs_org(NULL, 'Community Services Consortium', 'nonprofit', '541-752-1010',
    'CSC (Community Services Consortium): main line 541-752-1010. Utility Assistance Program: 541-704-7632.');
  PERFORM pg_temp.rs_draft(v, 'Utility Assistance Program (help paying utility bills)', 'Financial', all_people, local3, '541-704-7632', NULL,
    '541-704-7632 is the utility assistance intake line; their Corvallis main line is 541-752-1010.');
  -- CSC runs several programs; these four aren't on the sheet (added at Susanna's request
  -- 2026-11-12 from CSC's own pages). Public details are a few years old, so each says to check.
  -- Each has a different type: same phone + same type would be skipped as a duplicate.
  PERFORM pg_temp.rs_draft(v, 'Rent and deposit help', 'Financial', all_people, local3, '541-752-1010', NULL,
    'Not on the sheet; added from CSC''s website. Help with a deposit on a new rental, and rent help when funding allows. A 2023 Corvallis guide listed rent and utility help Wednesdays 9-11am at the Albany office. Check current hours, funding and eligibility with CSC.');
  PERFORM pg_temp.rs_draft(v, 'Rent Well (renter class)', 'Education', all_people, local3, '541-752-1010', NULL,
    'Not on the sheet; added from CSC''s website. A renter education class; the certificate can be shown to landlords (helps people with rental history problems). Check current class dates with CSC.');
  PERFORM pg_temp.rs_draft(v, 'Weatherization (home repairs to save energy)', 'Housing', all_people, local3, '541-752-1010', NULL,
    'Not on the sheet; added from CSC''s website. Repairs that make a home safer and more energy-efficient. Check who qualifies (including renters) with CSC.');
  PERFORM pg_temp.rs_draft(v, 'Job training and youth programs', 'Employment', all_people, local3, '541-752-1010', NULL,
    'Not on the sheet; added from CSC''s website. Job training and workforce programs, including programs for youth. Check which programs are running and who qualifies with CSC.');

  ALTER TABLE resident_service_reviews ENABLE TRIGGER resident_service_reviews_emit;

  -- ── One task for the batch ────────────────────────────────────────
  SELECT count(*) INTO v_open FROM resident_service_reviews r
   WHERE r.reviewed_at IS NULL
     AND r.partner_id IN (SELECT id FROM partners WHERE notes LIKE '%From the Community Resources sheet Resident Services hands out%');

  FOR a IN SELECT * FROM resident_services_room_admins() LOOP
    PERFORM emit_system_task(
      'resident_services', 'review-batch:community-resources-sheet-2026-11:' || a.id, a.id,
      'Check the Community Resources sheet programs — ' || v_open || ' organizations in "To review"',
      a.dept, 'p3'::priority, current_date + 30,
      'The organizations on the Community Resources sheet are in "To review" in the Resident '
        || 'Services room, with the programs already drafted from the sheet (name, type and phone). '
        || 'For each one: open it, fix anything wrong, add the address, hours and first steps, then '
        || 'click "Reviewed — this is correct". A few numbers on the sheet differ from public '
        || 'listings; those programs say so in their staff notes. Mark this task done when the list is through.'
    );
  END LOOP;
END $$;
