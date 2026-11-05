-- One-time move: Meaningful Connections that belong in the Directory (per the Directory SOP:
-- organizations in Sparrow's field always get a Directory record, and so does anyone we've
-- invited beyond the original conversation). List confirmed with Susanna 2026-11-04.
--
-- For each one: create (or reuse) the organization's Directory record as a Community Partner
-- prospect, owned by whoever logged the connection; add the person as a contact (with their
-- role, phone and email); carry "what was discussed" and "next step" into the record's notes;
-- carry a still-open next step into "Needs additional touchpoint" (with its due date, if any);
-- then archive the connection with a pointer to the record. Nothing is deleted.
--
-- Two pairs were merged into one organization each (they're programs of the same agency):
--   Benton County Health Department  <- Mia Murphy (Housing Navigator) + Developmental Diversity
--   Oregon Dept. of Human Services   <- Stephen March + Oregon Vocational Rehabilitation
-- WOAR is recorded as the Willamette Association of Realtors (with Priscilla Jensen) --
-- please confirm that's the same organization.
--
-- Depends on 0199 + 0200 (partner_contacts, archived_at, converted_to_partner_id).
-- Safe to re-run: a connection already moved (converted_to_partner_id set) is skipped, and
-- an organization is reused by name instead of duplicated. Runs outside the app (auth.uid()
-- is null), so it doesn't restamp "last checked" or send handoff notifications.

CREATE OR REPLACE FUNCTION pg_temp.mc_move(
  p_conns          uuid[],   -- connections to move into this one organization
  p_partner_id     uuid,     -- existing Directory record, or NULL to create/reuse by name
  p_new_name       text,     -- name for a new record
  p_owner_conn     uuid,     -- new record's owner = this connection's owner
  p_touchpoint_conn uuid     -- carry this connection's open next step into "Needs additional touchpoint"
) RETURNS uuid
  LANGUAGE plpgsql AS $$
DECLARE
  v_partner uuid := p_partner_id;
  c record;
  v_block text;
  v_contact text;
BEGIN
  IF v_partner IS NULL THEN
    SELECT id INTO v_partner FROM partners WHERE lower(name) = lower(p_new_name) LIMIT 1;
  END IF;

  IF v_partner IS NULL THEN
    INSERT INTO partners (name, type, sub_category, stage, owner_id, source, website)
    SELECT p_new_name, 'community', 'nonprofit', 'prospect', pc.owner_id,
           'Meaningful Connection' || COALESCE(' · ' || e.event_name, '')
             || COALESCE(' (' || to_char(e.event_date, 'Mon FMDD, YYYY') || ')', ''),
           (SELECT nullif(trim(x.website), '') FROM partnership_connections x
             WHERE x.id = ANY (p_conns) AND nullif(trim(x.website), '') IS NOT NULL LIMIT 1)
    FROM partnership_connections pc
    LEFT JOIN partnership_events e ON e.id = pc.event_id
    WHERE pc.id = p_owner_conn
    RETURNING id INTO v_partner;
  END IF;

  FOR c IN
    SELECT pc.*, e.event_name, e.event_date, pr.full_name AS owner_name
    FROM partnership_connections pc
    LEFT JOIN partnership_events e ON e.id = pc.event_id
    LEFT JOIN profiles pr ON pr.id = pc.owner_id
    WHERE pc.id = ANY (p_conns) AND pc.converted_to_partner_id IS NULL
    ORDER BY pc.created_at
  LOOP
    -- Contact (skip "unk." placeholders and anyone already on the list)
    v_contact := nullif(trim(c.name), '');
    IF v_contact IS NOT NULL AND lower(v_contact) NOT IN ('unk.', 'unk', 'unknown')
       AND NOT EXISTS (SELECT 1 FROM partner_contacts WHERE partner_id = v_partner AND lower(name) = lower(v_contact)) THEN
      INSERT INTO partner_contacts (partner_id, name, role, phone, email, is_primary, created_by)
      VALUES (v_partner, v_contact, nullif(trim(c.role), ''), nullif(trim(c.phone), ''), nullif(trim(c.email), ''),
              NOT EXISTS (SELECT 1 FROM partner_contacts WHERE partner_id = v_partner AND is_primary),
              NULL);
    END IF;

    -- Notes
    v_block := 'From Meaningful Connections (moved Nov 2026)'
      || COALESCE(': ' || CASE WHEN lower(coalesce(v_contact, '')) IN ('unk.', 'unk', 'unknown', '') THEN NULL ELSE v_contact END, '')
      || COALESCE(', met at ' || c.event_name, '')
      || COALESCE(' on ' || to_char(c.event_date, 'Mon FMDD, YYYY'), '')
      || COALESCE(' · logged by ' || c.owner_name, '')
      || COALESCE(E'\nDiscussed: ' || nullif(trim(c.what_discussed), ''), '')
      || COALESCE(E'\nNext step: ' || nullif(trim(c.next_action), ''), '')
      || CASE WHEN c.followup_done THEN ' (marked done)' ELSE '' END;
    UPDATE partners
    SET notes = CASE WHEN nullif(trim(notes), '') IS NULL THEN v_block ELSE notes || E'\n\n' || v_block END
    WHERE id = v_partner;

    -- Archive the connection, pointing at the record (also closes its follow-up task, 0200)
    UPDATE partnership_connections
    SET archived_at = now(), followup_done = true, converted_to_partner_id = v_partner
    WHERE id = c.id;
  END LOOP;

  -- Carry a still-open next step over as the record's one named touchpoint, unless the
  -- record already has one (existing records keep theirs; the step is in the notes).
  IF p_touchpoint_conn IS NOT NULL THEN
    UPDATE partners p
    SET needs_additional_touchpoint = true,
        additional_touchpoint_label = left(trim(pc.next_action), 200),
        additional_touchpoint_due = pc.followup_due
    FROM partnership_connections pc
    WHERE p.id = v_partner AND pc.id = p_touchpoint_conn
      AND NOT p.needs_additional_touchpoint
      AND nullif(trim(pc.next_action), '') IS NOT NULL;
  END IF;

  RETURN v_partner;
END $$;

DO $$ BEGIN
  -- ── New Directory records (17) ──
  -- Logged by Resident Services staff
  PERFORM pg_temp.mc_move(ARRAY['561c5643-a446-4f17-9523-a61e3d87135f']::uuid[], NULL, '211info',                          '561c5643-a446-4f17-9523-a61e3d87135f', '561c5643-a446-4f17-9523-a61e3d87135f');
  PERFORM pg_temp.mc_move(ARRAY['69bafb97-8acc-4294-ab79-36773ce21753']::uuid[], NULL, 'Benton County Veterans Services',  '69bafb97-8acc-4294-ab79-36773ce21753', NULL);
  PERFORM pg_temp.mc_move(ARRAY['da0a0f82-a167-4fd3-bce4-2dddda461cdc']::uuid[], NULL, 'Goodwill Industries',              'da0a0f82-a167-4fd3-bce4-2dddda461cdc', NULL);
  PERFORM pg_temp.mc_move(ARRAY['310709f0-f9a4-44cc-9315-261cef4afb01']::uuid[], NULL, 'Legal Aid Services of Oregon',     '310709f0-f9a4-44cc-9315-261cef4afb01', NULL);
  PERFORM pg_temp.mc_move(ARRAY['de28de28-d116-4d1b-97cd-5e64d84b11cb']::uuid[], NULL, 'Positive Behavior Supports Corp',  'de28de28-d116-4d1b-97cd-5e64d84b11cb', 'de28de28-d116-4d1b-97cd-5e64d84b11cb');
  PERFORM pg_temp.mc_move(ARRAY['46942f98-8969-47a8-b19d-78258fee7d46']::uuid[], NULL, 'Ride Line',                        '46942f98-8969-47a8-b19d-78258fee7d46', NULL);
  PERFORM pg_temp.mc_move(ARRAY['c5caee7c-8f72-4b8e-b5b3-1d13cf3572cf']::uuid[], NULL, 'Unity Shelter',                    'c5caee7c-8f72-4b8e-b5b3-1d13cf3572cf', NULL);
  PERFORM pg_temp.mc_move(ARRAY['579a640b-8992-490a-a1e5-8be1d252c583']::uuid[], NULL, 'We Care Benton County',            '579a640b-8992-490a-a1e5-8be1d252c583', NULL);
  -- Merged pairs (owner = the Partnerships contact who is pursuing the relationship)
  PERFORM pg_temp.mc_move(ARRAY['324bc58c-76ae-41ff-91de-5a95180996d5', '1d7f041c-189e-47d2-9c03-c6eb3575798b']::uuid[], NULL,
                          'Benton County Health Department', '324bc58c-76ae-41ff-91de-5a95180996d5', NULL);
  PERFORM pg_temp.mc_move(ARRAY['e2f05e0c-669a-4341-adee-9bf2b5c512c4', 'f7725616-c177-4694-a386-b96eedc6c2d0']::uuid[], NULL,
                          'Oregon Department of Human Services (DHS)', 'e2f05e0c-669a-4341-adee-9bf2b5c512c4', 'e2f05e0c-669a-4341-adee-9bf2b5c512c4');
  -- Logged by Partnerships staff
  PERFORM pg_temp.mc_move(ARRAY['b2bf33de-3dda-4d87-9278-68f68a17e077']::uuid[], NULL, 'Albany Area Habitat for Humanity', 'b2bf33de-3dda-4d87-9278-68f68a17e077', NULL);
  PERFORM pg_temp.mc_move(ARRAY['b4834d4c-905a-4f51-80f5-0a463e4536a1']::uuid[], NULL, 'CARDV',                            'b4834d4c-905a-4f51-80f5-0a463e4536a1', 'b4834d4c-905a-4f51-80f5-0a463e4536a1');
  PERFORM pg_temp.mc_move(ARRAY['2723e090-4aa9-4abd-b066-33b37559bc4b']::uuid[], NULL, 'Family Tree Relief Nursery',       '2723e090-4aa9-4abd-b066-33b37559bc4b', NULL);
  PERFORM pg_temp.mc_move(ARRAY['19bba969-992e-478a-b7e0-15eab1ccdb98']::uuid[], NULL, 'Harriet''s Housing',               '19bba969-992e-478a-b7e0-15eab1ccdb98', '19bba969-992e-478a-b7e0-15eab1ccdb98');
  PERFORM pg_temp.mc_move(ARRAY['c0c31e82-716c-4bf9-83b0-8a36cc8c6856', '6caeac75-69e4-46a3-b2f6-731ee72e4bf3']::uuid[], NULL,
                          'United Way', 'c0c31e82-716c-4bf9-83b0-8a36cc8c6856', NULL);
  PERFORM pg_temp.mc_move(ARRAY['95f82f59-95e6-4946-8224-33af95e94e21']::uuid[], NULL, 'WIC',                              '95f82f59-95e6-4946-8224-33af95e94e21', NULL);
  PERFORM pg_temp.mc_move(ARRAY['973e96cd-0b01-4143-ab87-72e193e2170c', '408a26f6-947d-479d-9659-1c458a5a10ec']::uuid[], NULL,
                          'Willamette Association of Realtors', '973e96cd-0b01-4143-ab87-72e193e2170c', NULL);

  -- ── Already in the Directory (6): add the person + notes, archive the connection ──
  PERFORM pg_temp.mc_move(ARRAY['8be237e0-7665-4d8f-9921-bea33c190ebe']::uuid[], '4093aa1b-8bfa-4187-a58c-57e8901e8b99', NULL, NULL, NULL); -- Love Inc
  PERFORM pg_temp.mc_move(ARRAY['05ba8b65-9780-4b18-b3de-405e450502c4']::uuid[], '696c630d-dc7d-4521-8a20-30d182b0f776', NULL, NULL, NULL); -- Arc Benton County
  PERFORM pg_temp.mc_move(ARRAY['83327566-5c0e-4cb7-a087-a6a3bee0061a', '70f36cfb-6b4e-4d58-a552-a0a61dd785a8',
                                'f1dc91f6-d0bf-4fb9-a8b7-d94067794909', '672a1736-60fd-47eb-855a-c9f4c747d8a6']::uuid[],
                          '2126148c-fb48-4e13-865e-b637fd780099', NULL, NULL, NULL); -- Crossroad Communities
  PERFORM pg_temp.mc_move(ARRAY['2877221d-bac4-4a22-af97-5ae79660b434']::uuid[], '11415efa-7088-4f0e-9472-ebe198db8383', NULL, NULL, NULL); -- Furniture Share
  PERFORM pg_temp.mc_move(ARRAY['0c39edb9-2d9f-4bf0-9b41-8ecbb37b3e57']::uuid[], '51641039-ac05-4b66-b254-7c58697bd557', NULL, NULL, NULL); -- Green Tree (The Hive)
  PERFORM pg_temp.mc_move(ARRAY['2f7078cd-a2ff-4617-a8ca-f139301b7ab1']::uuid[], '11a74b85-2245-4693-8c96-03a499a04f4e', NULL, NULL, NULL); -- Albany WaFd Bank

  -- Stay as Meaningful Connections (staff archive them when done): KRVM, Ace Handyman,
  -- Albany Civic Theater, Consign A Bubble, Kiwanis Sunrisers, Mouse Mountain, Oregon
  -- Marketing Group, Jeffrey Poston, Restoration, Willamette Valley Bank, Lillie Carr.
  -- Not sure (left alone): Community Dream Builders.
END $$;
