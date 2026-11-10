-- Bethany's Organizations Master Directory -> Directory + Resident Services "To review".
-- Sort agreed with Susanna 2026-11-06/10. Bethany: "This was the info for all the contacts
-- that we gathered in our area who offer services. We have not reached out to many of them
-- yet - we just wanted to have a pulse on who is around us and what they do."
--
-- From her 48 rows:
--   * 8 already have Directory records (CARDV, C.H.A.N.C.E., Crossroads, DevNW, Family Tree,
--     Furniture Share, Unity Shelter, We Care). Her info is added to their notes; phone /
--     email / website / address are only filled where the record has none.
--   * 2 fold into another record: Second Chance Shelter -> C.H.A.N.C.E. (it runs it);
--     "Heart & Hand" Oxford House -> one Oxford House record with the two current Lebanon
--     houses as contacts.
--   * 34 new Community Partner prospects (nonprofit), owned by Partnerships staff (Bethany).
--   * Left out: AGAPE Family Shelter (Lebanon, PENNSYLVANIA), a blank row, Salem Housing
--     Authority (Salem Section 8 only), AA/NA Meetings (no organization to have a
--     relationship with; Resident Services can add it as a service directly).
-- Every row's fields go into notes verbatim, labeled, plus what we confirmed in the Sept 2026
-- check (corrected addresses, We Care's real details, etc.). No stage changes, no check-ins.
--
-- All 42 organizations are sent to Resident Services "To review". The room admin closes any
-- that have nothing for residents ("close without adding"). Instead of 42 separate tasks +
-- notifications, the room admin gets ONE task for the batch.
--
-- Also fixes DevNW: its email field held Rosa Martinez's role ("Asset Building Specialist").
--
-- Depends on 0199/0200/0206. Safe to re-run: records are matched by id or name, contacts by
-- name, notes by their heading, reviews by the one-open-review index, the task by its ref.
-- Runs outside the app (auth.uid() is null), so "last checked" isn't stamped.

CREATE OR REPLACE FUNCTION pg_temp.ingest(
  p_existing uuid, p_name text, p_phone text, p_email text, p_website text, p_address text,
  p_blocks text[], p_contacts jsonb
) RETURNS uuid
  LANGUAGE plpgsql AS $$
DECLARE
  v_partner uuid := p_existing;
  v_block text;
  c jsonb;
BEGIN
  IF v_partner IS NULL THEN
    SELECT id INTO v_partner FROM partners WHERE lower(name) = lower(p_name) LIMIT 1;
  END IF;

  IF v_partner IS NULL THEN
    INSERT INTO partners (name, type, sub_category, stage, owner_id, source, phone, email, website, address)
    VALUES (p_name, 'community', 'nonprofit', 'prospect',
            (SELECT id FROM profiles WHERE full_name = 'Bethany' AND active LIMIT 1),
            'Bethany''s Organizations Master Directory (2026)',
            p_phone, p_email, p_website, p_address)
    RETURNING id INTO v_partner;
  ELSE
    UPDATE partners
       SET phone   = COALESCE(nullif(trim(phone), ''), p_phone),
           email   = COALESCE(nullif(trim(email), ''), p_email),
           website = COALESCE(nullif(trim(website), ''), p_website),
           address = COALESCE(nullif(trim(address), ''), p_address)
     WHERE id = v_partner;
  END IF;

  FOREACH v_block IN ARRAY p_blocks LOOP
    UPDATE partners
       SET notes = CASE WHEN nullif(trim(notes), '') IS NULL THEN v_block ELSE notes || E'\n\n' || v_block END
     WHERE id = v_partner
       AND position(split_part(v_block, E'\n', 1) IN coalesce(notes, '')) = 0;
  END LOOP;

  FOR c IN SELECT * FROM jsonb_array_elements(p_contacts) LOOP
    IF NOT EXISTS (SELECT 1 FROM partner_contacts WHERE partner_id = v_partner AND lower(name) = lower(c->>'name')) THEN
      INSERT INTO partner_contacts (partner_id, name, role, phone, email, notes, is_primary, created_by)
      VALUES (v_partner, c->>'name', c->>'role', c->>'phone', c->>'email', c->>'notes',
              NOT EXISTS (SELECT 1 FROM partner_contacts WHERE partner_id = v_partner AND is_primary),
              NULL);
    END IF;
  END LOOP;

  INSERT INTO resident_service_reviews (partner_id, sent_by)
  VALUES (v_partner, (SELECT id FROM profiles WHERE full_name = 'Susanna' LIMIT 1))
  ON CONFLICT (partner_id) WHERE reviewed_at IS NULL DO NOTHING;

  RETURN v_partner;
END $$;

DO $$
DECLARE
  a record;
  v_open int;
BEGIN
  -- One batch task instead of one task + notification per organization.
  ALTER TABLE resident_service_reviews DISABLE TRIGGER resident_service_reviews_emit;

  PERFORM pg_temp.ingest(
    '70e828cd-bf86-4219-a2aa-45a774e2e47e', $q$CARDVA$q$,
    $q$541-758-0219$q$, NULL, $q$https://cardv.org/$q$, NULL,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "CARDVA":
Type: Nonprofit
Services / focus: Domestic Violence Shelter
Services notes: 24 Hour Crisis Support Line, Rape and Domestic Abuse crisis support, 24 hour confidential shelter, support gorups, legal advocacy
Location: Corvallis
Who they serve: Women, Survivors of Domestic Violence, Children (0-12), Single Moms
Summary: Domestic abuse assistance
Status: Not contacted
Priority: High
Address: Corvallis, OR
Phone: 541-758-0219
Website: https://cardv.org/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    '7bd39678-6d6b-47ce-939f-7481732a39b0', $q$C.H.A.N.C.E.$q$,
    NULL, NULL, $q$https://chancerecovery.org/$q$, NULL,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "C.H.A.N.C.E.":
Type: Nonprofit
Services / focus: Substance Use Recovery
Services notes: Community Helping Addicts Negotiate Change Effectively (C.H.A.N.C.E.) is a non-profit agency offering support for those who have experienced or are experiencing addiction and homelessness
Location: Corvallis
Who they serve: Individuals with Substance Abuse
Summary: Addiction recovery and homeless service
Contact person: Holly
Title / role: Case Management
Status: Active Partnership
Priority: High
Address: Corvallis OR
Phone: Office #541-224-7839
Website: https://chancerecovery.org/$q$,
          $q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Second Chance Shelter":
Type: Other
Services / focus: Emergency Shelter, Substance Abuse Recovery Support, Hygiene / Showers /Laundry, Food Assistance / Pantries, Housing Assistance / Referrals, Transitional Housing, Case Management
Services notes: They offer emergency and transitional housing as well as help people get connected to local needed resources. They are under C.H.A.N.C.E. in Corvallis but do not seem to have the same capacity for resources.
Location: Albany
Who they serve: Families , Single Moms, Single Dads, Men, Women, Individuals experiencing homelessness, Families Experiencing Homelessness, Chronically Homeless Individuals, Individuals with Substance Abuse, Low-Income
Summary: Homeless shelter offering resources to homeless families and individuals
Status: Not contacted
Priority: High
Next planned step: It would be good to drop by and make a contact with them even though we are already connected with C.H.A.N.C.E., they may have families they could refer to us.
Address: 1100 Jackson Street, Albany OR 97322
Phone: (541) 967-8545
Website: albany.salvationarmy.org$q$,
          $q$Sept 2026 check: Second Chance Shelter (Albany) is run by C.H.A.N.C.E., so it's on this record rather than its own. Bethany's list gave albany.salvationarmy.org as its website; that's the Salvation Army's site, not theirs. C.H.A.N.C.E. office line per Bethany's list: 541-224-7839.$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    '2126148c-fb48-4e13-865e-b637fd780099', $q$CROSSROADS COMMUNITIES$q$,
    $q$(541) 405-4210$q$, $q$info@crossroadsc.org$q$, NULL, $q$Lebanon, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "CROSSROADS COMMUNITIES":
Type: Nonprofit
Services / focus: Transitional Housing, Life Skills, Case Management, Transportation Assistance, Emergency Shelter, Job Training / Workforce Development, Food Assistance / Pantries
Services notes: IHN-CRC Rural Oral Health Program The CRC Transport Van Cascade Cottages Apartments Crossroads Connections Men's Transitional House Sleep Trailer
Location: Lebanon
Who they serve: Individuals with Substance Abuse, Low-Income, Individuals experiencing homelessness
Summary: Dedicated to providing transitional housing for those recovering from life's challenges that have moved them out of the mainstream
Status: Not contacted
Priority: High
Address: Lebanon, OR
Email: info@crossroadsc.org
Phone: (541) 405-4210
Website: https://www.crossroadsc.org/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    '9be8aab7-7718-449e-89d5-9d6d8f383dd1', $q$Dev NW$q$,
    NULL, NULL, NULL, NULL,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Dev NW":
Type: Nonprofit
Services / focus: Affordable Housing, Financial Planning Services, Homeownership Support
Services notes: 6 month financial education program before recieving services, need to be driven with bigger capacity, 2-3 nights a week
Location: Corvallis
Who they serve: Low-Income
Summary: Spotty communication, requires a lot of effort on behalf of the families
Status: Not contacted
Priority: Low$q$,
          $q$Sept 2026 check: DevNW is the legal successor to "Corvallis Neighborhood Housing Services Inc." (checked Sept 2026).$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    'c6d74a4e-8b7d-4250-829b-3c3b1ac73f60', $q$Family Tree Relief Nursery$q$,
    NULL, NULL, NULL, NULL,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Family Tree Relief Nursery":
Type: Nonprofit
Services / focus: Substance Abuse Recovery Support, Parent Education & Support, Home Visitation, Therapeutic Early Childhood Programs
Services notes: Mission: to prevent and overcome the interconnected issues of child abuse, domestic violence, and homelessness and support saftey, healing, and stability for individuals and families.
Location: Albany
Who they serve: Families, Children (0-12)
Summary: Temporary hotels, help
Status: Identified / Researching
Priority: Medium
Next planned step: They might have insight into families in crisis who might need the support of rebuilding their life with what Sparrow offers - we would need to ask more to know if what we offer would connect to the families they serve.$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    '11415efa-7088-4f0e-9472-ebe198db8383', $q$Furniture Share$q$,
    NULL, NULL, NULL, NULL,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Furniture Share":
Type: Nonprofit
Services / focus: Furniture
Location: Albany
Who they serve: Low-Income
Summary: A furniture bank that gathers donated furniture and household items and gives them to families in need.
Status: Identified / Researching
Priority: Low
Next planned step: This could be a helpful contact for anyone in our community or family moving out on their own after the program.$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    '9b2ed65a-7cb4-495a-a51b-89c566bf7c4c', $q$Unity Shelter$q$,
    $q$541-286-5121$q$, $q$info@unityshelter.org$q$, $q$https://unityshelter.org/$q$, $q$4515 SW West Hills Rd., Corvallis, OR 97333$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Unity Shelter":
Type: Nonprofit
Services / focus: Emergency Shelter, Hygiene / Showers /Laundry, Food Assistance / Pantries, Resource Support
Services notes: They have a women's shelter as well as a men's shelter in Corvallis as well as basic services to help support people in homelessness.
Location: Corvallis
Who they serve: Men, Women, Individuals experiencing homelessness
Summary: They run a mens emergency overnight shelter as well as an emergency overnight shelter for women. They run a Safe Place housing program of microshelters as a transitional housing option. They do not serve families.
Status: Not contacted
Priority: Medium
Next planned step: We could reach out to their women's shelter to offer our information for women coming through with children.
Address: 4515 SW West Hills Rd., Corvallis, OR 97333
Email: info@unityshelter.org
Phone: 541-286-5121
Website: https://unityshelter.org/?utm_source=chatgpt.com$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    '20168986-9219-4b93-b873-cc7768794b34', $q$We Care Benton County$q$,
    $q$541-203-0102$q$, $q$intake@wecarecorvallis.org$q$, $q$https://wecarecorvallis.org/$q$, $q$125 NW 10th St, Corvallis, OR 97330$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "We Care Benton County":
Type: Nonprofit
Services / focus: Emergency Shelter, Resource Support, Warming / Cooling Centeres
Services notes: They have an emphasis on being low barrier and available to people who cannot meet requirements to get into other shelters or programs.
Location: Corvallis
Who they serve: Individuals experiencing homelessness, Low-Income
Summary: Audrey has gotten consistent rent support from them for people in our community.
Status: Not contacted , Initital Contact Made
Priority: Low
Address: 530 SW 3rd St, Corvallis, OR 97333
Email: info@wecarebentoncounty.org
Phone: 541-753-4530$q$,
          $q$Sept 2026 check: Bethany's list below describes a shelter / warming-cooling center at 530 SW 3rd St with info@wecarebentoncounty.org and 541-753-4530. That doesn't match We Care. Checked on wecarecorvallis.org in Sept 2026: one-time financial help only (rent, deposits, utility bills, occasional small medical bills) for Benton County residents, up to $500 per household, decided weekly by a volunteer board. No shelter. Intake 541-203-0102. Legal name: Corvallis-Benton County Council of Religious Organizations Inc.$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Albany Helping Hands$q$,
    $q$541-926-4036$q$, $q$wecare@albanyhh.org$q$, $q$https://www.albanyhelpinghands.org/$q$, $q$619 9th Ave SE, Albany, OR 97322$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Albany Helping Hands":
Type: Nonprofit
Services / focus: Transitional Housing, Food Assistance / Pantries, Clothing / Household Goods, Family Mentorship / Case Management, Youth Mentorship & Programs, Family Advocacy, Job Training / Workforce Development, Life Skills
Services notes: Albany Helping Hands is a faith-based nonprofit providing shelter, meals, and support to help people regain independence. Emergency shelter, safe home for women & children (The Bailey Home), sobriety accountability, case managment & prayer
Location: Albany
Who they serve: Families , Single Moms, Single Dads, Individuals experiencing homelessness, Families Experiencing Homelessness, Unsheltered Individuals, Survivors of Domestic Violence, Seniors, Low-Income
Summary: Non-denominational, faith based non-profit offering transitional and emergency housing.
Contact person: Ben - Case Manager, Troy - Office Assistant & Resource Manager
Status: Not contacted
Priority: Medium
Address: 619 9th Ave SE, Albany, OR 97322
Email: wecare@albanyhh.org
Phone: 541 926 4036
Website: https://www.albanyhelpinghands.org/services$q$],
    $q$[{"name":"Ben","role":"Case Manager","phone":null,"email":null,"notes":null},{"name":"Troy","role":"Office Assistant & Resource Manager","phone":null,"email":null,"notes":null}]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Albany Partnership for Housing & Community Development (APHCD)$q$,
    $q$541-926-5451$q$, NULL, $q$https://albanypartnership.org/$q$, $q$Albany, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Albany Partnership for Housing & Community Development (APHCD)":
Type: Nonprofit
Services / focus: Permenant Supportive Housing, Case Management
Services notes: - 133 Units of Affordable Housing - Resident Case Management - Tenant Landlord Mediation - Tenant & Community Agency Referrals - Free use of site Community Room
Location: Albany
Who they serve: Low-Income
Summary: A non-profit community development organization that has developed and maintained multi-dwelling affordable housing serving individuals and families with low incomes. They have 400 residents in 133 units with available resident services.
Contact person: Tiffany (Program and Office Assistant), Sara Drayton (Administrative Compliance/Property Manager)
Status: Not contacted
Priority: Low
Address: Albany, OR
Email: parkrose@aphcd.org (Sara)
Phone: Sara #541-926-5451, Tiffany #541-926-5451
Website: https://albanypartnership.org/$q$],
    $q$[{"name":"Sara Drayton","role":"Administrative Compliance / Property Manager","phone":"541-926-5451","email":"parkrose@aphcd.org","notes":null},{"name":"Tiffany","role":"Program and Office Assistant","phone":"541-926-5451","email":null,"notes":null}]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$ChristWalk Supportive Transitional Housing$q$,
    $q$541-409-1281$q$, NULL, NULL, $q$Lebanon, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "ChristWalk Supportive Transitional Housing":
Type: Nonprofit
Services / focus: Transitional Housing
Services notes: No services noted
Location: Lebanon
Who they serve: Unsheltered Individuals, Women, Men
Summary: Faith-based ~ We are helping homeless people find a place to live, shake addictions, and get a job.
Address: Lebanon, OR
Phone: 541-409-1281
Website: https://www.homelessshelterdirectory.org/shelter/or_christwalk-supportive-transitional-housing$q$,
          $q$Sept 2026 check: Not confirmed open or closed (checked Sept 2026; nothing found from 2025–26). Kept on the list as uncertain. The website on Bethany's list is a homelessshelterdirectory.org listing, not their own site.$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Community Outreach Inc. (COI)$q$,
    NULL, NULL, $q$https://communityoutreachinc.org/$q$, NULL,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "COI (Community Outreach Incorporated)":
Type: Nonprofit
Services / focus: Transitional Housing, Family Mentorship, Parenting Support, Family Advocacy, Job Training / Workforce Development, Life Skills, Case Management, Medical Care
Services notes: COI delivers appropriate services to help people help themselves and others lead healthy, productive lives. We respond to human needs by providing direct services, and by collaborating with other agencies and organizations.
Location: Corvallis, Albany
Who they serve: Families , Single Moms, Single Dads, Pregnant , Individuals experiencing homelessness, Families Experiencing Homelessness, Unsheltered Individuals, Chronically Homeless Individuals, Survivors of Domestic Violence, Veterans, Individuals with Mental Health Challenges, Low-Income
Summary: We engage with our clients to identify and create useful pathways for themselves. We invite them to consider alternative courses of action going forward. As they do, transformative change in thinking, belief, and action takes root. We support them as they build new habits and patterns for their lives. In this way, we help people help themselves lead healthy and productive lives.
Website: https://communityoutreachinc.org/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Corvallis Daytime Drop-In Center (CDDC)$q$,
    NULL, NULL, NULL, $q$530 SW 4th Street, Corvallis, OR 97333$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Corvallis Daytime Drop In Center (CDDC)":
Type: Nonprofit
Services / focus: Hygiene / Showers /Laundry, Clothing / Household Goods, Food Assistance / Pantries
Services notes: Peer support services
Location: Corvallis
Who they serve: Chronically Homeless Individuals, Unsheltered Individuals, Low-Income
Summary: Daytime resources
Status: Not contacted
Priority: Low
Address: 530 SW 4th Street, Corvallis OR 97333
Website: Corvallis Daytime Drop-in Center – Where Needs Are Met$q$,
          $q$Sept 2026 check: Active as of Sept 2026, but lost a $2M federal grant in 2026 and was mid-relocation. Check their status before referring anyone.$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Corvallis Housing First$q$,
    $q$(541) 230-1297$q$, $q$admin@corvallishousingfirst.org$q$, $q$https://www.corvallishousingfirst.org/$q$, $q$2311 NW Van Buren Ave., Corvallis, OR 97330$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Corvallis Housing First":
Type: Nonprofit
Services / focus: Emergency Shelter, Transitional Housing, Homeless Outreach, Case Management, Seniors, Veterans, Utilities Assistance, Permenant Supportive Housing
Location: Corvallis
Who they serve: Men, Women, Unsheltered Individuals, Individuals experiencing homelessness, Chronically Homeless Individuals
Summary: Housing service that works to help get people into housing as quickly as possible. They also offer supportive services and case management.
Contact person: Dan Easley Evan Finley
Status: Not contacted, In Active Conversation
Priority: High
Address: 2311 NW Van Buren Ave., Corvallis, OR 97330
Email: admin@corvallishousingfirst.org
Phone: (541) 230-1297
Website: https://www.corvallishousingfirst.org/?utm_source=chatgpt.com$q$,
          $q$Sept 2026 check: Sept 2026: Susanna left a message at 541-230-1297 asking whether their WRAP (Women's Rental Assistance Program) is still running. WRAP isn't on their current website; the only listing found was from 2016.$q$],
    $q$[{"name":"Dan Easley","role":null,"phone":null,"email":null,"notes":null},{"name":"Evan Finley","role":null,"phone":null,"email":null,"notes":null}]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Creating Housing Coalition$q$,
    $q$541-791-6262$q$, NULL, NULL, $q$Albany, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Creating Housing Coalition":
Type: Nonprofit
Services / focus: Affordable Housing
Services notes: Lower income housing opportunity
Location: Albany
Who they serve: Low-Income, People with Disabilities, Foster Youth , Seniors
Summary: Tiny house village for disadvantaged individuals and families
Status: Not contacted
Priority: Low
Phone: 541-791-6262$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Emergence Rehab$q$,
    NULL, NULL, $q$https://www.4emergence.com/$q$, $q$Albany, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Emergence Rehab":
Type: Nonprofit
Services / focus: Substance Use Recovery
Services notes: Emergence Addiction & Behavorial - Albany, Emergence - Eugene (Outpatient)
Location: Albany
Who they serve: Individuals with Substance Abuse
Summary: Has been offering services for over 40 years.
Status: Not contacted
Priority: Medium
Address: Albany, Eugene, Springfield
Website: https://www.4emergence.com/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Faith, Hope & Charity Inc$q$,
    $q$(541) 740-5807$q$, NULL, $q$https://faithhopeandcharityinc.org/$q$, $q$460 SW Madison Ave, Suite #1, Corvallis, OR 97333$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Faith, Hope & Charity Inc":
Type: Nonprofit
Services / focus: Emergency Shelter, Food Assistance / Pantries, Clothing / Household Goods, Hygiene / Showers /Laundry, Youth Mentorship & Programs
Services notes: Faith Hope & Charity exists to help individuals and families move from feeling stagnant or overwhelmed toward thriving by providing compassionate coaching, mentoring, guidance, and connection to resources—grounded in unconditional support and belief in personal growth.
Location: Corvallis
Who they serve: Teens / Youth (13 -17) , Young Adults (18-24), Families , Single Moms, Single Dads, Men, Women, Individuals experiencing homelessness, Families Experiencing Homelessness, Unsheltered Individuals
Summary: Faith Hope & Charity is a trauma-informed nonprofit focused on supporting people facing challenging life circumstances.
Contact person: (541)-740-5807
Status: Not contacted
Priority: Low
Last contacted: Multiple attempts have been made to contact this agency, but there has never beena response.
Address: 460 SW Madison Ave, Suite #1, Corvallis, OR 97333
Phone: (541)-740-5807
Website: https://faithhopeandcharityinc.org/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Family Assistance and Resource Center Group$q$,
    $q$(541) 224-7503$q$, $q$executivedirector@facforthehomeless.org$q$, $q$https://www.facforthehomeless.org/$q$, NULL,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Family Assistance and Resource Center Group":
Type: Nonprofit
Services / focus: Emergency Shelter, Housing Assistance / Referrals, Resource Support
Services notes: Emergency Shelter Harm Reduction Services Housing Assistance Community Outreach
Location: Lebanon, Sweet Home
Who they serve: Chronically Homeless Individuals, Individuals experiencing homelessness, Families Experiencing Homelessness
Summary: Supporting Linn County with Shelter and Hope - The Family Assistance & Resource Center Group is committed to offering shelter and outreach/harm reduction services grounded in empathy and community care. Our mission is to create a safe space for every resident of Linn County, guided by principles of dignity, compassion, and inclusivity.
Status: Not contacted
Priority: Medium
Next planned step: It would be great to reach out to them because they do referrals and let them know about the services that we provide for families.
Address: Lebanon, Sweet Home, Albany OR
Email: executivedirector@facforthehomeless.org
Phone: (541)-224-7503
Website: https://www.facforthehomeless.org/contact/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$FISH of Albany$q$,
    $q$(541) 928-4460$q$, NULL, $q$https://www.fishofalbany.com/$q$, $q$1035 SE 2nd Ave, Albany, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Fish of Albany":
Type: Nonprofit
Services / focus: Food Assistance / Pantries, Clothing / Household Goods, Transportation Assistance, Resource Support, Emergency Shelter
Services notes: Clothing, crisis intervention, food, transport, gap services, guest house ?
Location: Albany
Who they serve: Families , Low-Income, Women, Men
Summary: Guest young family shelter, emergency & practical support
Status: Identified / Researching
Priority: Low
Address: 1035 SE 2nd Avenue
Email: home
Phone: 541-758-4460 (teen parent guest house?) , (541) 928-4460
Website: https://www.fishofalbany.com/contact.html$q$,
          $q$Sept 2026 check: Bethany's list also has 541-758-4460 marked "teen parent guest house?". Not confirmed.$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$God's Storehouse$q$,
    $q$(541) 995-8403$q$, NULL, $q$https://gods-storehouse.edan.io/$q$, $q$180 Smith St, Harrisburg, OR 97446$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "God's Storehouse":
Type: Nonprofit
Services / focus: Food Assistance / Pantries, Thrift Store
Services notes: Tues & Thurs ~ 9a-4:30p
Location: Harrisburg
Who they serve: Families , Low-Income, Women, Men
Summary: Food Bank
Status: Not contacted, Identified / Researching
Priority: Low
Address: Salem, OR 9180 Smith St, Harrisburg, OR 974467302
Email: https://gods-storehouse.edan.io/
Phone: (541) 995-8403$q$,
          $q$Sept 2026 check: Address corrected Sept 2026: 180 Smith St (Bethany's list had 9180).$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Oxford House$q$,
    $q$1-800-951-3514$q$, NULL, NULL, NULL,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Oxford House":
Type: Nonprofit
Services / focus: Transitional Housing, Affordable Housing, Substance Use Recovery, Substance Abuse Recovery Support
Services notes: The purpose of an Oxford House is to provide safe, sober, and self-governed housing for individuals recovering from substance abuse, offering a peer-supported, drug-free environment where residents learn to live independently through democratic self-management, mutual accountability, and shared responsibility, fostering long-term recovery.
Location: Corvallis, Albany, Salem, Eugene, Lebanon, Sweet Home, Springfield, Junction City, Statewide
Who they serve: Men, Women, Individuals experiencing homelessness, Families Experiencing Homelessness, Unsheltered Individuals, Survivors of Domestic Violence, Veterans, Seniors, Low-Income
Summary: Independently run sober homes, eleven locations in Albany, several in Corvallis
Contact person: 1-800-951-3514
Status: Not contacted
Priority: Low
Next planned step: This is a good resource for women who may no longer wish to be involved with Sparrow, and don't have another place to go at the time.
Address: Corvallis, Albany, Salem$q$,
          $q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Heart & Hand for Homeless (an Oxford House)":
Type: Volunteer Group
Services notes: Resource info
Summary: We are a democratically ran, self sufficient, supportive home. So if you're clean and sober, working a program of recovery and/or needing a home base to keep progressing forward towards the life you've dreamed.
Address: Lebanon, OR
Email: None available
Phone: (541)981-1083$q$,
          $q$Sept 2026 check: "Heart & Hand for Homeless" (Lebanon) on Bethany's list wasn't in Oxford House's Oregon directory under that name. The two current Lebanon houses are Kruesi Women's and River Park Men's (see contacts). Keep both tracked.$q$],
    $q$[{"name":"Aaleijah Thomas","role":"Kruesi Women's Oxford House (Lebanon)","phone":"458-322-3733","email":null,"notes":"House phone 541-405-4412. 852 W Sherman St, Lebanon. Women, including women with children. Interviews Wednesdays 5pm."},{"name":"Leno Torres","role":"River Park Men's Oxford House (Lebanon)","phone":"541-570-6071","email":null,"notes":"House phone 541-405-4674. 147 S Main St, Lebanon. Men. Interviews Sundays 6pm."}]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$McKinney-Vento Program (school districts)$q$,
    NULL, NULL, NULL, NULL,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "McKinney-Vento Program":
Type: Other, Government program
Services / focus: Homeless Outreach, Case Management, Parent Education & Support, Transportation Assistance, Family Advocacy, Transitional Housing
Services notes: Federally mandated program that is housed in school districts and meets the needs of homeless/ displaced students.Each school runs their program individually with different resources available.
Location: Corvallis, Albany, Salem, Eugene, Harrisburg, Lebanon, Sweet Home, Springfield, Brownsville, Junction City
Who they serve: Families , Single Moms, Single Dads, Children (0-12) , Teens / Youth (13 -17) , Foster Youth , Families Experiencing Homelessness, Eviction-At-Risk Households, Low-Income
Summary: Federally mandated program addressing homeless students within each school district. Liaisons interact with the homeless families guaranteeing education and transportation to-and-from school and activities.
Contact person: Sarah Devine 541-230-4735
Title / role: Family Advocate/ McKinney Vento Liaison
Status: Not contacted
Priority: Low
Address: 865 LaSalle St. Harrisburg, OR 97446
Phone: 541-995-6626$q$,
          $q$Sept 2026 check: Every school district has its own McKinney-Vento liaison; the contact here is Harrisburg's.$q$],
    $q$[{"name":"Sarah Devine","role":"Family Advocate / McKinney-Vento Liaison, Harrisburg School District","phone":"541-230-4735","email":null,"notes":"Harrisburg School District: 865 LaSalle St, Harrisburg, OR 97446 · 541-995-6626"}]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Milestones Family Recovery$q$,
    $q$(541) 738-6832$q$, NULL, $q$https://milestonesrecovery.com/$q$, $q$442 NW 4th Street, Corvallis, OR 97330$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Milestones":
Type: Nonprofit
Services / focus: Substance Use Recovery, Substance Abuse Recovery Support, Case Management, Transitional Housing, Life Skills
Services notes: They provide residential treatment for addiction recovery, outpatient care, and supportive services (education, life skills, case management, and transitional housing planning.
Location: Corvallis
Who they serve: Women, Men, Families , Individuals with Substance Abuse
Summary: Sobriety support, skill support, transitional housing planning
Contact person: Kendra
Title / role: Case manager
Status: In Active Conversation
Priority: High
Next planned step: We are actively emailing with Kendra right now about potential referrals for future openings in our program.
Address: 442 NW 4th Street Corvallis, OR 97330
Email: kendraroberts@milestonerecovery.com
Phone: (541) 738-6832
Website: https://milestonesrecovery.com/$q$,
          $q$Sept 2026 check: Checked Sept 2026: 12-bed women's residential treatment, family-centered; kids under 6 can stay.$q$],
    $q$[{"name":"Kendra Roberts","role":"Case Manager","phone":null,"email":"kendraroberts@milestonerecovery.com","notes":null}]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Salvation Army – Albany Corps$q$,
    $q$541-928-4774$q$, NULL, $q$https://albany.salvationarmy.org/$q$, $q$345 Columbus St SE, Albany, OR 97321$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Salvation Army - Albany Corp":
Type: Nonprofit
Services / focus: Food Assistance / Pantries, Clothing / Household Goods, Resource Support, Thrift Store, Rent support, Utilities Assistance, Faith Based Outreach, Housing Assistance / Referrals
Services notes: Salvation Army of Albany, Oregon, is a faith-based community center that provides social services, emergency assistance, and religious programs to residents of Linn County. They have a Thrift Store that operates 7 days/week.~ Some of their services (rent/ utiilities) may only be available to Linn Co residents. ~ They also have a Christmas gift program and facilitate programs for drug/ETOH recovery.
Location: Albany, Eugene, Junction City, Salem
Who they serve: ALL
Contact person: Major Michael Johnson:Michael.Johnson@usw.salvationarmy.org
Status: Not contacted
Priority: Low
Address: 345 Columbus St SE, Albany, OR 97321
Phone: 541-928-4774
Website: albany.salvationarmy.org$q$],
    $q$[{"name":"Michael Johnson","role":"Major","phone":null,"email":"Michael.Johnson@usw.salvationarmy.org","notes":null}]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Serenity Lane$q$,
    $q$541-928-9681$q$, $q$outreach@serenitylane.org$q$, $q$https://serenitylane.org/$q$, $q$1050 Price Rd SE, Albany, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Serenity Lane Rehab":
Type: Nonprofit
Services / focus: Substance Abuse Recovery Support, Medical detox, Residential / Inpatient Treatment, Outpatient programs, Trauma Infromed Care, Case Management
Services notes: Outpatient care - more rigorous program is 10 weeks long, also offer long term residential treatment. Some centers offer cognitive-behavioral therapy and relapse prevention, motivational interviewing, and trauma informed care.
Location: Albany
Who they serve: Men, Women, Individuals with Substance Abuse, Families
Summary: Alcohol & drug treatment, CARF- accredited addiction treatment organization
Status: Not contacted
Priority: High
Next planned step: Next we should contact them with an introductory email and see if it is possible to stop by and meet people and share our information.
Address: 1050 Price Rd SE, Albany - and Eugene, Salem
Email: outreach@serenitylane.org
Phone: 541-928-9681
Website: https://serenitylane.org/contact/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Sharing Hands$q$,
    $q$(541) 466-3003$q$, NULL, $q$https://sharinghands.org/$q$, $q$107 W Bishop Way, Brownsville, OR 97327$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Sharing Hands":
Type: Nonprofit
Services / focus: Food Assistance / Pantries, Clothing / Household Goods, Parent Education & Support, Thrift Store
Services notes: Food Bank ~ Wednesday & Friday 10:30 am – 3:00 pm
Location: Brownsville
Who they serve: ALL
Summary: Food Bank & Thrift Store
Contact person: Debra Gruell
Title / role: Director
Status: Initital Contact Made
Priority: Low
Next planned step: This is a low priority program, but they do have contact with homeless families needing assistance.
Address: 439 N. Main St, Brownsville, OR 97327
Email: https://sharinghands.org/food-bank/
Phone: (541) 466-3003
Website: https://sharinghands.org$q$,
          $q$Sept 2026 check: Address corrected Sept 2026: 107 W Bishop Way (Bethany's list had 439 N Main St).$q$],
    $q$[{"name":"Debra Gruell","role":"Director","phone":null,"email":null,"notes":null}]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$St. Vincent de Paul (Corvallis)$q$,
    $q$541-286-4183$q$, $q$svdpcorvallis@gmail.com$q$, $q$https://svdpcorvallis.com/$q$, $q$501 NW 25th St., Corvallis, OR 97330$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "St Vincent de Paul":
Type: Nonprofit
Services / focus: Food Assistance / Pantries, Clothing / Household Goods, Utilities Assistance, Resource Support, Emergency Shelter
Services notes: St. Vincent de Paul of Corvallis is a nonprofit, all-volunteer organization dedicated to providing essential assistance to low-income individuals and families in Benton County.
Location: Albany, Salem, Eugene, Junction City
Who they serve: Families , Single Moms, Single Dads, Young Adults (18-24), Pregnant , Men, Women, Eviction-At-Risk Households, Low-Income
Summary: We are a nonprofit all-volunteer organization in Corvallis, OR committed to feeding the hungry, clothing the needy, and serving the forgotten.
Status: Not contacted
Priority: Low
Next planned step: We could reach out to them with an introductory email to let them know of our services and provide the opportunity for referrals.
Address: 501 NW 25th St. Corvallis, OR 97330
Email: svdpcorvallis@gmail.com
Phone: 541-286-4183
Website: svdpcorvallis.com$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Sweet Home Emergency Ministries (SHEM)$q$,
    $q$(541) 367-6504$q$, $q$shemfoodbank@gmail.com$q$, $q$http://www.shemfoodbank.org/$q$, $q$1115 Long Street, Sweet Home, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Sweet Home Emergency Ministries (SHEM)":
Type: Nonprofit
Services / focus: Food Assistance / Pantries, Resource Support
Services notes: They provide emergency food boxes for low income households in need and seem to help people get connected to resources.
Location: Sweet Home
Who they serve: Families , Low-Income, Women, Men
Summary: Our numerous outreach community programs provide desperately needed services and resources to the most marginalized members of our community. Services include food boxes, utility and eviction assistance, gasoline and propane, and prescriptions. They also have Carmen's Closet
Status: Not contacted
Priority: Medium
Address: 1115 Long Street, Sweet Home, OR
Email: shemfoodbank@gmail.com
Phone: (541) 367-6504
Website: http://www.shemfoodbank.org/available-services/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Teen Challenge (Willamette Valley)$q$,
    $q$(458) 233-6100$q$, $q$info.wvmc@teenchallengepnw.com$q$, $q$https://teenchallengepnw.com/locations/willamette-valley-campus/$q$, NULL,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Teen Challenge":
Type: Nonprofit
Services / focus: Transitional Housing, Substance Use Recovery, Bible-based discipleship, Counseling, Job Training / Workforce Development, Case Management
Services notes: They have a women's campus in Eugene and a men's location in Shedd. They offer very structured year of growth, intentionality, counseling, discipleship and career training opportunities.
Location: Eugene, Shedd
Who they serve: Men, Women, Individuals with Substance Abuse
Summary: Drug & Alcohol addiction recovery
Status: Initital Contact Made
Priority: Medium
Last contacted: I am not sure when, but we toured their location and made some connection. Andrew and Bethany also met their community relations representative at a lunch.
Next planned step: I am not sure when, but we toured their location and made some connection. Andrew and Bethany also met their community relations representative. We made contact to host a booth at their golf event in August and plan to participate this year in 2026.
Address: Eugene (women's location), Shedd (Men's location)
Email: info.wvmc@teenchallengepnw.com
Phone: (458) 233-6100
Website: https://teenchallengepnw.com/locations/willamette-valley-campus/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Vina Moses Center$q$,
    $q$541-753-1420$q$, $q$info@vinamoses.org$q$, $q$https://www.vinamoses.org/$q$, $q$Corvallis, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Vina Moses Center":
Type: Nonprofit
Services / focus: Clothing / Household Goods, Utilities Assistance, Resource Support
Services notes: They run a thift store for people in need and everything is free. Clothing, hygiene items, resources etc. They also sometimes offer financial assistance in some cases to help people stay in their homes. They also have supplies for new babies.
Location: Corvallis
Who they serve: Families Experiencing Homelessness, Individuals experiencing homelessness, Low-Income
Summary: Donated goods, thrift store for free
Status: Not contacted
Priority: Medium
Address: Corvallis, OR
Email: info@vinamoses.org
Phone: 541-753-1420
Website: https://www.vinamoses.org/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Church at the Park$q$,
    NULL, NULL, $q$https://www.church-at-the-park.org/$q$, $q$Salem, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Church at the Park":
Type: Nonprofit
Services / focus: Job Training / Workforce Development, Permenant Supportive Housing, Homeless Outreach
Services notes: Housing assistance for the homeless, they also do direct outreach connection and build relationships at the local homeless camps.
Location: Salem
Who they serve: Women, Men, Individuals experiencing homelessness, Unsheltered Individuals
Summary: To date, C@P has focused on providing three things for our unsheltered neighbors: collaborative outreach and navigation, housing-focused sheltering, and workforce development; C@P is now working toward a fourth focus of supported permanent housing, which will help us to be even more successful at achieving our other three aims.
Status: Not contacted
Priority: Medium
Address: Salem, OR
Email: https://www.church-at-the-park.org/contact
Website: https://www.church-at-the-park.org/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Cornerstone Community Housing$q$,
    $q$(541) 683-1751$q$, $q$info@cornerstonecommunityhousing.org$q$, $q$https://cornerstonecommunityhousing.org/$q$, $q$Eugene, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Cornerstone Community Housing":
Type: Nonprofit
Services / focus: Life Skills, Financial Coaching / Budgeting , Permenant Supportive Housing, Affordable Housing, Health & Welness Education / Support
Services notes: Self improvement/life skill classes, housing assistance, food/health learning, financial classes
Location: Eugene
Who they serve: Families , Families Experiencing Homelessness, Low-Income
Summary: Housing services for families facing homelessness, offering services to promote economic independence
Status: Not contacted
Priority: High
Address: Eugene, OR
Email: info@cornerstonecommunityhousing.org
Phone: (541) 683-1751
Website: https://cornerstonecommunityhousing.org/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Everyone Village$q$,
    $q$(541) 505-7597$q$, NULL, $q$https://everyonevillage.org/$q$, $q$3825 Janisse St., Eugene, OR 97402$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Everyone Village":
Type: Nonprofit
Services / focus: Transitional Housing, Food Assistance / Pantries, Clothing / Household Goods, Transportation Assistance, Medical Care, Permenant Supportive Housing, Substance Use Recovery, Trauma Infromed Care, Job Training / Workforce Development, Life Skills, Case Management
Services notes: Everyone Village is a dynamic transitional shelter program for folks experiencing homelessness in Eugene, Oregon. Operated by Everyone Church, Everyone Village brings wrap-around support services into one intentional community.
Location: Eugene
Who they serve: Individuals experiencing homelessness, Unsheltered Individuals
Summary: Transitional Housing for Homeless
Contact person: (541) 505-7597/ M-F, 9-4pm
Status: Identified / Researching
Priority: High
Next planned step: This would be a good connection for Sparrow. It doesn't appear that families/children are part of their housing ministry, so letting them know about SM could be a good resource.
Address: Physical location: 3825 Janisse St., Eugene, OR 97402 Lane County, Oregon Mailing address: Everyone Village, PO Box 5217, Eugene, OR 97405
Email: https://everyonevillage.org/
Phone: (541) 505-7597
Website: everyonevillage.org$q$,
          $q$Sept 2026 check: Mailing address: PO Box 5217, Eugene, OR 97405. Phone hours M–F 9–4.$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Family Promise of the Mid Willamette Valley$q$,
    $q$(503) 370-9752$q$, $q$info@familypromisemwv.org$q$, $q$https://www.familypromisemwv.org/$q$, $q$1055 Edgewater St NW, Salem, OR 97304$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Family Promise of the Mid Willamette Valley":
Type: Nonprofit
Services / focus: Emergency Shelter, Housing Assistance / Referrals, Resource Support, Financial Coaching / Budgeting , Job Training / Workforce Development, Life Skills
Services notes: Prevention services, emergency shelter, graduate support services, support programs
Location: Salem
Who they serve: Families , Children (0-12) , Teens / Youth (13 -17)
Summary: Eradicating family homelessness in Mid-Willamette Valley
Status: Not contacted , Identified / Researching
Priority: High
Next planned step: It would be great to contact them to let them know who we are, they are in Salem which is a bit further. It sounds like it is a group of churches that are doing this together.
Address: 1055 Edgewater St NW Salem, OR 97304
Email: info@familypromisemwv.org
Phone: (503) 370-9752
Website: https://www.familypromisemwv.org/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$One Hope Network$q$,
    NULL, NULL, $q$https://onehopenetwork.org/$q$, $q$Eugene, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "One Hope Network":
Type: Nonprofit
Services / focus: Transitional Housing, Prayer, Food Assistance / Pantries, Community Events & Relationship Building, Faith Based Outreach, Volunteer Mobilization, Network
Services notes: Sell tiny homes to people looking to transition out of homelessness for $5700 each, unity events, school supplies/support
Location: Springfield, Eugene
Who they serve: Families , Men, Individuals experiencing homelessness, Low-Income
Summary: Support families, unhoused and connect the church to serve Lane County. Their initiative called Cottages of Hope works in collaboration with Everyone Village and provides houses for the Everyone Village tranisitional housing community. These homes are only for individuals and would not be able to sustain families.
Contact person: Steve Buss (Executive Director)
Status: Not contacted
Priority: Medium
Next planned step: Sometime I would love for us to go meet them and see if there could be any partnership. They develop transitional housing but seem to be distinctly focused on Lane county and only producing small transitional homes.
Address: Eugene, OR
Website: https://onehopenetwork.org/$q$],
    $q$[{"name":"Steve Buss","role":"Executive Director","phone":null,"email":null,"notes":null}]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Oregon Alliance$q$,
    $q$(503) 399-9076$q$, NULL, $q$https://www.oregonalliance.org/$q$, NULL,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Oregon Alliance":
Type: Nonprofit
Services / focus: Network, Legistlative advocacy
Services notes: A member association and advocacy network for organizations focused on youth, children, and families across Oregon.
Location: Statewide
Who they serve: Families , Teens / Youth (13 -17) , Foster Youth , Families Experiencing Homelessness, Low-Income
Summary: Connect organizations supporting families across Oregon at a legislative and systems level, advocating policies that support family services.
Status: Identified / Researching
Priority: High
Next planned step: It would be interesting to call them and have a conversation - probably should be Audrey doing it or Andrew.
Address: Statewide network
Phone: (503) 399-9076
Website: https://www.oregonalliance.org/contact-us$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Polk County PATHS (Partners Aligned Toward Housing Solutions)$q$,
    $q$(503) 751-1644$q$, NULL, NULL, $q$1407 Monmouth-Independence Hwy, Monmouth, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Polk County PATHS (Partners Alligned Toward Housing Solutions)":
Type: Network
Services / focus: Transitional Housing
Services notes: Operates as an advisory counsel for efforts towards aiding housing issues. It is focused on Polk county.
Location: Other
Summary: Adult transitional shelter
Contact person: Nicole Pineda
Status: Identified / Researching
Priority: Low
Next planned step: I am not sure what connection with this would look like other than to inform them of our program and seek out referrals.
Address: 1407 Monmouth-Independence Hwy, Monmouth
Phone: (503) 751-1644$q$],
    $q$[{"name":"Nicole Pineda","role":null,"phone":null,"email":null,"notes":null}]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Path Home$q$,
    $q$503-504-5902$q$, $q$admin@eoportland.org$q$, $q$https://path-home.org/$q$, $q$Portland, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Path Home":
Type: Nonprofit
Services / focus: Emergency Shelter, Family Advocacy, Resource Support, Case Management, Rent support
Services notes: A 24-hour trauma-informed shelter for families with children under 18. Families have private rooms, meals, laundry, showers, play spaces for kids, and supportive case management. They also do rent support and case management for 6-12 months to help families find and retain stable living.
Location: Portland
Who they serve: Families , Families Experiencing Homelessness, Eviction-At-Risk Households, Low-Income
Summary: Helps homeless families with children get long term housing or prevent evictions.
Status: Identified / Researching
Priority: Medium
Next planned step: It would be great to send them information on who we are with maybe a letter and follow up phone call. They would be focusing on the Portland area, but with their case management, they might appreciate options for their families that would need our services.
Address: Portland, OR
Email: ADMIN@EOPORTLAND.ORG
Phone: 503.504.5902
Website: https://www.eopdx.org/portland-homeless-family-solutions$q$,
          $q$Sept 2026 check: Formerly "Portland Homeless Family Solutions"; current site is path-home.org (checked Sept 2026). The eopdx.org link on Bethany's list is the old one.$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$St. Francis Family Housing$q$,
    $q$503-588-0428$q$, $q$office@sfssalem.org$q$, $q$https://www.sfssalem.org/$q$, $q$1820 Berry Street SE, Salem, OR 97302$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "St Francis Family Housing":
Type: Nonprofit
Services / focus: Transitional Housing, Financial Coaching / Budgeting , Life Skills, Case Management, Family Advocacy, Job Training / Workforce Development, Childcare / Early Childhood
Services notes: Families residing on our campus are a part of our St. Francis community. Families have access to a staff member 24/7 and also receive wraparound services and community resources. In addition, families have access to our all-weather accessible playground, our whole campus internet network, and our on-campus library program.
Location: Salem
Who they serve: Families , Families Experiencing Homelessness
Summary: St. Francis Family Housing is the largest unrestricted provider of transitional housing for homeless families with children under age 18 in Marion and Polk Counties.
Status: Not contacted
Priority: High
Next planned step: We could reach out to them with an introductory email to let them know of our services and provide the opportunity for referrals if they have a full waitlist.
Address: 1820 Berry Street SE, Salem, OR 97302
Email: office@sfssalem.org
Phone: 503-588-0428
Website: https://www.sfssalem.org/contact$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$The ARCHES Project (MWVCAA)$q$,
    $q$503-399-9080$q$, NULL, $q$https://mwvcaa.org/programs/the-arches-project/$q$, $q$1615 Commercial Street NE, Salem, OR 97301$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "The ARCHES Project":
Type: Nonprofit
Services / focus: Emergency Shelter, Transitional Housing, Permenant Supportive Housing, Hygiene / Showers /Laundry, Food Assistance / Pantries, Veterans, Homeless Outreach, Housing Assistance / Referrals, Rent support
Services notes: The ARCHES Project is a major homeless services and housing outreach division of the Mid-Willamette Valley Community Action Agency (MWVCAA). Based in Salem, Oregon, it serves as a central hub for individuals and families experiencing housing instability or homelessness in Marion and Polk counties.
Location: Salem
Who they serve: Families , Single Moms, Single Dads, Men, Women, Individuals experiencing homelessness, Families Experiencing Homelessness, Unsheltered Individuals, Chronically Homeless Individuals, Eviction-At-Risk Households, Veterans, Low-Income, Teens / Youth (13 -17) , ALL
Summary: The ARCHES Project is a major homeless services and housing outreach division of the Mid-Willamette Valley Community Action Agency (MWVCAA). Based in Salem, Oregon, it serves as a central hub for individuals and families experiencing housing instability or homelessness in Marion and Polk counties and helps clients navigate from homelessness to stable housing and better lives.
Status: Not contacted
Priority: High
Last contacted: We have not contacted anyone at the Arches Project
Next planned step: This could be a good resourse for SM since they operate the Arches Nest which is a family housing support program offering housing to homeless famlies.
Address: Mid-Willamette Valley Community Action 475 Center St. Salem, OR 97301 The Arches Project 1615 Commercial Street, NE, Salem, OR 97301 9:00a–4:30p, M–Sa
Email: https://mwvcaa.org/programs/the-arches-project/contact-us/
Phone: 503-399-9080
Website: https://mwvcaa.org/programs/the-arches-project/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Shepherd's Door (Portland Rescue Mission)$q$,
    $q$503-647-7466$q$, NULL, $q$https://portlandrescuemission.org/$q$, $q$Portland, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Shepherd's Door (Portland Rescue Mission)":
Type: Nonprofit
Services / focus: Transitional Housing, Job Training / Workforce Development, Life Skills, Parenting Support, Legal Aid, Advocacy
Services notes: This is a year long program hosted by the Portland Rescue mission specifically designed for helping women and their childlren who are seeking recovery.
Location: Portland
Who they serve: Single Moms, Children (0-12) , Families Experiencing Homelessness, Families
Summary: Addiction recovery, vocation training, counseling, education
Status: Not contacted
Priority: Medium
Address: Portland, OR
Phone: 503-647-7466
Website: https://portlandrescuemission.org/$q$],
    $q$[]$q$::jsonb);
  PERFORM pg_temp.ingest(
    NULL, $q$Women at the Well Grace House$q$,
    $q$(971) 600-3627$q$, $q$info@ghsalem.com$q$, $q$https://watwgracehouse.org/$q$, $q$1243 Peace Street SE, Salem, OR$q$,
    ARRAY[$q$From Bethany's Organizations Master Directory (added Nov 2026), listed as "Women at the Well Grace House":
Type: Nonprofit
Services / focus: Community Events & Relationship Building, Emergency Shelter, Life Skills, Case Management, Job Training / Workforce Development
Services notes: Housing and community
Location: Salem
Who they serve: Women, Individuals experiencing homelessness
Summary: Transitional housing and support for disadvantaged single women with no children
Status: Not contacted
Priority: Medium
Next planned step: We could contact them and offer ourselves as a referral for women who may come to them with children and cannot be accepted into their program.
Address: 1243 Peace Street SE, Salem OR
Email: info@ghsalem.com
Phone: (971) 600-3627
Website: https://watwgracehouse.org/$q$],
    $q$[]$q$::jsonb);

  ALTER TABLE resident_service_reviews ENABLE TRIGGER resident_service_reviews_emit;

  -- DevNW: role was typed into the email field.
  UPDATE partners SET role = 'Asset Building Specialist', email = NULL
   WHERE id = '9be8aab7-7718-449e-89d5-9d6d8f383dd1' AND email = 'Asset Building Specialist';

  SELECT count(*) INTO v_open FROM resident_service_reviews r
   WHERE r.reviewed_at IS NULL
     AND r.partner_id IN (SELECT id FROM partners WHERE notes LIKE '%From Bethany''s Organizations Master Directory%');

  FOR a IN SELECT * FROM resident_services_room_admins() LOOP
    PERFORM emit_system_task(
      'resident_services', 'review-batch:master-directory-2026-11:' || a.id, a.id,
      'Review Bethany''s list — ' || v_open || ' organizations in "To review"',
      a.dept, 'p3'::priority, current_date + 30,
      'Partnerships brought in Bethany''s Organizations Master Directory: organizations near us '
        || 'that offer services. Most haven''t been contacted yet. Each one is under "To review" '
        || 'in the Resident Services room with everything from her list in its notes. Add the '
        || 'programs residents can use and click "Reviewed — this is correct", or use "Nothing here '
        || 'for residents → close without adding". Some are outside Linn/Benton (Salem, Eugene, '
        || 'Portland): keep the shelters residents could go to if they lose housing. Mark this task '
        || 'done when the list is through.'
    );
  END LOOP;
END $$;
