-- Sparrow — LCP: backfill the 11 historical/pre-system participant families
-- from Sparrow_LifeChange_Outcomes_Report (Susanna's July 13, 2026 copy,
-- confirmed accurate against real staff knowledge on 2026-08-28, except Kim's
-- status which is a currently-active family and is NOT part of this script).
--
-- Depends on migration 0176 (stably_housed, lcp_outcome_checkins,
-- lcp_household_adults.phone now optional) -- run that first.
--
-- KNOWN GAPS, read before running/trusting this data:
-- 1. No real dates exist anywhere in the source report -- entry date, exit
--    date, and the "~3 months later" follow-up date are all genuinely
--    unknown. families.program_end_date is left NULL and every check-in's
--    checkin_date is left NULL (labeled instead) rather than inventing a
--    plausible-looking date that would misrepresent precision we don't have.
--    A NULL program_end_date also means the automatic check-in-reminder
--    engine will never fire for these families -- correct, since they
--    already have a full manually-entered history, not an open reminder.
-- 2. login_email is a placeholder ("archived.<name>@lcp.internal") -- not a
--    real address, never emailed, cannot be used to sign in. Required
--    because families.login_email doubles as the sign-in allowlist and is
--    NOT NULL + UNIQUE.
-- 3. Children have no real names in the source report, only counts (e.g.
--    "Charity (3 children)") -- entered as placeholder "Child 1"/"Child 2"/
--    etc. Susanna's call: leave these for Shelly/Audrey to fill in for real
--    later, since they'll know the actual names.
-- 4. lcp_household_adults supports exactly ONE adult per family (see 0095).
--    Two households in the source report describe two adults (David &
--    Geneva; Forrest & Christie) -- modeled here as a single combined-label
--    adult record, since the schema has no second-adult slot. Flagged, not
--    silently smoothed over.
-- 5. The "3 months later" check-in's stably_housed value is NOT independently
--    documented for 10 of the 11 families -- per Susanna's explicit
--    instruction, it's set to the SAME value as the exit check-in for every
--    family except Gracie (who the report itself describes as later becoming
--    homeless again), rather than left unentered. If real intermediate
--    outcome information later surfaces for any of these families, add a
--    real dated check-in via the family's own Progress tab instead of
--    editing this script.
--
-- Safe to re-run: each family is skipped (via login_email match) if it
-- already exists, so running this twice does not create duplicates.

DO $$
DECLARE
  fam_id uuid;
  i int;
BEGIN
  -- Charity (3 children) — stably housed (HUD duplex)
  IF NOT EXISTS (SELECT 1 FROM families WHERE login_email = 'archived.charity@lcp.internal') THEN
    INSERT INTO families (display_name, login_email, status, active, stably_housed)
    VALUES ('Charity', 'archived.charity@lcp.internal', 'graduated', false, true)
    RETURNING id INTO fam_id;
    INSERT INTO lcp_household_adults (family_id, full_name) VALUES (fam_id, 'Charity');
    FOR i IN 1..3 LOOP
      INSERT INTO lcp_household_children (family_id, full_name) VALUES (fam_id, 'Child ' || i);
    END LOOP;
    INSERT INTO lcp_outcome_checkins (family_id, label, stably_housed, notes) VALUES
      (fam_id, 'Exit (historical, date unknown)', true, 'Housed through HUD after 7 months in a brand new duplex. Has lived there ever since.'),
      (fam_id, '~3 months post-exit (historical, date unknown)', true, 'No change reported.');
  END IF;

  -- Suzette (3 children) — fully independent
  IF NOT EXISTS (SELECT 1 FROM families WHERE login_email = 'archived.suzette@lcp.internal') THEN
    INSERT INTO families (display_name, login_email, status, active, stably_housed)
    VALUES ('Suzette', 'archived.suzette@lcp.internal', 'graduated', false, true)
    RETURNING id INTO fam_id;
    INSERT INTO lcp_household_adults (family_id, full_name) VALUES (fam_id, 'Suzette');
    FOR i IN 1..3 LOOP
      INSERT INTO lcp_household_children (family_id, full_name) VALUES (fam_id, 'Child ' || i);
    END LOOP;
    INSERT INTO lcp_outcome_checkins (family_id, label, stably_housed, notes) VALUES
      (fam_id, 'Exit (historical, date unknown)', true, 'Obtained own housing through work and eventually started her own business. Created a family with one child''s father. Has lived independently, off the system and welfare, ever since.'),
      (fam_id, '~3 months post-exit (historical, date unknown)', true, 'No change reported.');
  END IF;

  -- Daniel (1 child) — moved to shelter program
  IF NOT EXISTS (SELECT 1 FROM families WHERE login_email = 'archived.daniel@lcp.internal') THEN
    INSERT INTO families (display_name, login_email, status, active, stably_housed)
    VALUES ('Daniel', 'archived.daniel@lcp.internal', 'needs_attention', false, false)
    RETURNING id INTO fam_id;
    INSERT INTO lcp_household_adults (family_id, full_name) VALUES (fam_id, 'Daniel');
    INSERT INTO lcp_household_children (family_id, full_name) VALUES (fam_id, 'Child 1');
    INSERT INTO lcp_outcome_checkins (family_id, label, stably_housed, notes) VALUES
      (fam_id, 'Exit (historical, date unknown)', false, 'Entered a COI shelter after the program, having been unable to maintain stable employment.'),
      (fam_id, '~3 months post-exit (historical, date unknown)', false, 'No change reported.');
  END IF;

  -- David & Geneva (3 children) — left early, no housing (2-adult household;
  -- schema supports only one adult record, see gap #4 above)
  IF NOT EXISTS (SELECT 1 FROM families WHERE login_email = 'archived.davidgeneva@lcp.internal') THEN
    INSERT INTO families (display_name, login_email, status, active, stably_housed)
    VALUES ('David & Geneva', 'archived.davidgeneva@lcp.internal', 'needs_attention', false, false)
    RETURNING id INTO fam_id;
    INSERT INTO lcp_household_adults (family_id, full_name) VALUES (fam_id, 'David & Geneva');
    FOR i IN 1..3 LOOP
      INSERT INTO lcp_household_children (family_id, full_name) VALUES (fam_id, 'Child ' || i);
    END LOOP;
    INSERT INTO lcp_outcome_checkins (family_id, label, stably_housed, notes) VALUES
      (fam_id, 'Exit (historical, date unknown)', false, 'Did not follow program rules; asked to leave early. No housing obtained.'),
      (fam_id, '~3 months post-exit (historical, date unknown)', false, 'No change reported.');
  END IF;

  -- Kristable (1 child) — stably housed (HUD → own)
  IF NOT EXISTS (SELECT 1 FROM families WHERE login_email = 'archived.kristable@lcp.internal') THEN
    INSERT INTO families (display_name, login_email, status, active, stably_housed)
    VALUES ('Kristable', 'archived.kristable@lcp.internal', 'graduated', false, true)
    RETURNING id INTO fam_id;
    INSERT INTO lcp_household_adults (family_id, full_name) VALUES (fam_id, 'Kristable');
    INSERT INTO lcp_household_children (family_id, full_name) VALUES (fam_id, 'Child 1');
    INSERT INTO lcp_outcome_checkins (family_id, label, stably_housed, notes) VALUES
      (fam_id, 'Exit (historical, date unknown)', true, 'Rented a manufactured home via HUD housing assistance in the park. Has since moved out into a home outside the park.'),
      (fam_id, '~3 months post-exit (historical, date unknown)', true, 'No change reported.');
  END IF;

  -- Jack (1 child) — stably housed (HUD)
  IF NOT EXISTS (SELECT 1 FROM families WHERE login_email = 'archived.jack@lcp.internal') THEN
    INSERT INTO families (display_name, login_email, status, active, stably_housed)
    VALUES ('Jack', 'archived.jack@lcp.internal', 'graduated', false, true)
    RETURNING id INTO fam_id;
    INSERT INTO lcp_household_adults (family_id, full_name) VALUES (fam_id, 'Jack');
    INSERT INTO lcp_household_children (family_id, full_name) VALUES (fam_id, 'Child 1');
    INSERT INTO lcp_outcome_checkins (family_id, label, stably_housed, notes) VALUES
      (fam_id, 'Exit (historical, date unknown)', true, 'Rented a manufactured home via HUD housing assistance. Still lives there.'),
      (fam_id, '~3 months post-exit (historical, date unknown)', true, 'No change reported.');
  END IF;

  -- Forrest & Christie (2 children) — home ownership (inherited) (2-adult
  -- household; schema supports only one adult record, see gap #4 above)
  IF NOT EXISTS (SELECT 1 FROM families WHERE login_email = 'archived.forrestchristie@lcp.internal') THEN
    INSERT INTO families (display_name, login_email, status, active, stably_housed)
    VALUES ('Forrest & Christie', 'archived.forrestchristie@lcp.internal', 'graduated', false, true)
    RETURNING id INTO fam_id;
    INSERT INTO lcp_household_adults (family_id, full_name) VALUES (fam_id, 'Forrest & Christie');
    FOR i IN 1..2 LOOP
      INSERT INTO lcp_household_children (family_id, full_name) VALUES (fam_id, 'Child ' || i);
    END LOOP;
    INSERT INTO lcp_outcome_checkins (family_id, label, stably_housed, notes) VALUES
      (fam_id, 'Exit (historical, date unknown)', true, 'Came from a shelter. Forrest cared for a terminally ill neighbor, who left him his home as an inheritance. They still live in that home today.'),
      (fam_id, '~3 months post-exit (historical, date unknown)', true, 'No change reported.');
  END IF;

  -- Elizabeth (1 child) — accepted into another program
  IF NOT EXISTS (SELECT 1 FROM families WHERE login_email = 'archived.elizabeth@lcp.internal') THEN
    INSERT INTO families (display_name, login_email, status, active, stably_housed)
    VALUES ('Elizabeth', 'archived.elizabeth@lcp.internal', 'needs_attention', false, false)
    RETURNING id INTO fam_id;
    INSERT INTO lcp_household_adults (family_id, full_name) VALUES (fam_id, 'Elizabeth');
    INSERT INTO lcp_household_children (family_id, full_name) VALUES (fam_id, 'Child 1');
    INSERT INTO lcp_outcome_checkins (family_id, label, stably_housed, notes) VALUES
      (fam_id, 'Exit (historical, date unknown)', false, 'Left due to mental illness concerns. Later had a mental health episode causing her son to enter foster care. Staff connected her to a foster family, who cared for her son ~9 months until she regained custody.'),
      (fam_id, '~3 months post-exit (historical, date unknown)', false, 'No change reported.');
  END IF;

  -- Rose (1 child) — home ownership, no government aid
  IF NOT EXISTS (SELECT 1 FROM families WHERE login_email = 'archived.rose@lcp.internal') THEN
    INSERT INTO families (display_name, login_email, status, active, stably_housed)
    VALUES ('Rose', 'archived.rose@lcp.internal', 'graduated', false, true)
    RETURNING id INTO fam_id;
    INSERT INTO lcp_household_adults (family_id, full_name) VALUES (fam_id, 'Rose');
    INSERT INTO lcp_household_children (family_id, full_name) VALUES (fam_id, 'Child 1');
    INSERT INTO lcp_outcome_checkins (family_id, label, stably_housed, notes) VALUES
      (fam_id, 'Exit (historical, date unknown)', true, 'Used inheritance from her father to purchase a home in the park, enabling her to live inexpensively and work only while her son is in school. Moved out exactly one year after entering. No government assistance required.'),
      (fam_id, '~3 months post-exit (historical, date unknown)', true, 'No change reported.');
  END IF;

  -- Sarah (2 children) — expelled, connected to shelter
  IF NOT EXISTS (SELECT 1 FROM families WHERE login_email = 'archived.sarah@lcp.internal') THEN
    INSERT INTO families (display_name, login_email, status, active, stably_housed)
    VALUES ('Sarah', 'archived.sarah@lcp.internal', 'needs_attention', false, false)
    RETURNING id INTO fam_id;
    INSERT INTO lcp_household_adults (family_id, full_name) VALUES (fam_id, 'Sarah');
    FOR i IN 1..2 LOOP
      INSERT INTO lcp_household_children (family_id, full_name) VALUES (fam_id, 'Child ' || i);
    END LOOP;
    INSERT INTO lcp_outcome_checkins (family_id, label, stably_housed, notes) VALUES
      (fam_id, 'Exit (historical, date unknown)', false, 'Violated program rules by having a boyfriend move in secretly. Expelled. Staff connected her to a COI shelter so she would not be on the street.'),
      (fam_id, '~3 months post-exit (historical, date unknown)', false, 'No change reported.');
  END IF;

  -- Gracie (3 children) — housed at exit, later homeless again (DV) --
  -- the one family whose 3-month check-in genuinely differs from exit,
  -- per Susanna's explicit instruction and the report's own narrative.
  IF NOT EXISTS (SELECT 1 FROM families WHERE login_email = 'archived.gracie@lcp.internal') THEN
    INSERT INTO families (display_name, login_email, status, active, stably_housed)
    VALUES ('Gracie', 'archived.gracie@lcp.internal', 'needs_attention', false, false)
    RETURNING id INTO fam_id;
    INSERT INTO lcp_household_adults (family_id, full_name) VALUES (fam_id, 'Gracie');
    FOR i IN 1..3 LOOP
      INSERT INTO lcp_household_children (family_id, full_name) VALUES (fam_id, 'Child ' || i);
    END LOOP;
    INSERT INTO lcp_outcome_checkins (family_id, label, stably_housed, notes) VALUES
      (fam_id, 'Exit (historical, date unknown)', true, 'Left program to live with boyfriend and get her own home. Initially happy and housed.'),
      (fam_id, '~3 months post-exit (historical, date unknown)', false, 'Boyfriend became abusive. She and her children are now homeless again.');
  END IF;
END $$;
