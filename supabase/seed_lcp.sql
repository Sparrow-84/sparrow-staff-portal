-- Sparrow — LifeChange Program seed (SYNTHETIC data, no real participant PII).
-- Run AFTER 0010_lcp_resources.sql and AFTER seed.sql (needs the curriculum columns from
-- 0009 + the lcp_resources table from 0010 + the staff profile UUIDs).
--
-- IMPORTANT: families.login_email doubles as the participant sign-in allowlist.
-- To test a real login, change ONE of the example.com addresses below to an email
-- you control, then use "First time? Create your password" in the participant app.
-- (In Supabase → Authentication → Providers, disable "Confirm email" for dev, or
-- click the confirmation link.)

-- ─── LCP staff access tiers (Full = Shelly, Audrey, Andrew · Extended = Bethany, Susanna) ──
update profiles set lcp_role = 'full'     where id = '00000000-0000-0000-0000-000000000001'; -- Andrew
update profiles set lcp_role = 'extended' where id = '00000000-0000-0000-0000-000000000002'; -- Susanna
update profiles set lcp_role = 'full'     where id = '00000000-0000-0000-0000-000000000003'; -- Shelly
update profiles set lcp_role = 'extended' where id = '00000000-0000-0000-0000-000000000004'; -- Bethany
update profiles set lcp_role = 'full'     where id = '00000000-0000-0000-0000-000000000005'; -- Audrey (dual-role)

-- ─── Curriculum: "Building Your House" — 6 phases · 13 rooms · 48 sessions · 12 months ──
-- Content transcribed from Susanna's concept map (INGEST/"LifeChange Program House
-- Diagram.pdf"). `scripture` is filled only where the diagram explicitly cites a verse;
-- Shelly can add the rest in Curriculum Admin (Phase 2). The brief's "14 units" headline
-- was an off-by-one — the diagram and this seed both have 13 rooms.
insert into lcp_phases (number, name, sort_order) values
  (1, 'Groundwork',              1),
  (2, 'Heart of the Home',       2),
  (3, 'Rest & Restoration',      3),
  (4, 'Purpose & Vision',        4),
  (5, 'Outer Life',              5),
  (6, 'Whole House & Graduation',6);

insert into lcp_units (phase_id, name, sort_order, month_label, artifact, supplement) values
  ((select id from lcp_phases where number=1), 'Foundation',       1, 'Month 1',   'Foundation stone — name + intention, kept all year', null),
  ((select id from lcp_phases where number=1), 'Basement',         2, 'Month 2',   null,                                                 null),
  ((select id from lcp_phases where number=2), 'Front Door',       3, 'Month 3',   null,                                                 null),
  ((select id from lcp_phases where number=2), 'Living Room',      4, 'Month 3–4', 'Personal Covenant',                                  null),
  ((select id from lcp_phases where number=2), 'Kitchen & Dining', 5, 'Month 4–5', 'Place setting',                                      null),
  ((select id from lcp_phases where number=2), 'Bathroom',         6, 'Month 5',   'Walking Out drawing',                                null),
  ((select id from lcp_phases where number=3), 'Master Bedroom',   7, 'Month 6',   'Letter to My Child',                                 null),
  ((select id from lcp_phases where number=3), 'Kids'' Bedroom',   8, 'Month 7',   'Blessing Card ceremony',                             'Optional: Parenting with Autism & ADHD (3 sessions)'),
  ((select id from lcp_phases where number=4), 'Office',           9, 'Month 8',   'Vision Board',                                       null),
  ((select id from lcp_phases where number=4), 'Attic',           10, 'Month 9',   'Legacy Card · Final house drawing',                  null),
  ((select id from lcp_phases where number=5), 'Fence',           11, 'Month 10',  null,                                                 null),
  ((select id from lcp_phases where number=5), 'Tree in the Yard',12, 'Month 11',  null,                                                 null),
  ((select id from lcp_phases where number=6), 'Whole House',     13, 'Month 12',  'Graduation — artifacts returned · legacy cards read aloud · community commissioning', null);

-- The 48 sessions, numbered globally 1..48 in room order. `focus` is the descriptive line
-- from the diagram; `scripture` only where the diagram cites one.
insert into lcp_sessions (unit_id, session_number, title, sort_order, focus, scripture) values
  -- Phase 1 · Groundwork
  ((select id from lcp_units where name='Foundation'),        1, 'What does your house look like right now?', 1, 'Honest self-assessment · house drawing created', null),
  ((select id from lcp_units where name='Foundation'),        2, 'Who told you that about yourself?',         2, 'Naming the lies · replacing them with truth', null),
  ((select id from lcp_units where name='Foundation'),        3, 'What is my foundation made of?',            3, 'False foundations named · choosing the Rock', null),
  ((select id from lcp_units where name='Foundation'),        4, 'Laying the first stone',                    4, 'Covenant with self · the stone artifact, kept all year', null),
  ((select id from lcp_units where name='Basement'),          5, 'What''s in the basement?',                  5, 'Hidden and suppressed things that affect everything above', null),
  ((select id from lcp_units where name='Basement'),          6, 'The things we inherited',                   6, 'Generational patterns: what was passed down', null),
  ((select id from lcp_units where name='Basement'),          7, 'Buried alive — shame and secrecy',          7, 'Shame thrives in the dark · what happens when hidden things come to light', null),
  ((select id from lcp_units where name='Basement'),          8, 'Cleaning out the basement',                 8, 'The practical and spiritual work of excavation', null),
  -- Phase 2 · Heart of the Home
  ((select id from lcp_units where name='Front Door'),        9, 'What does your front door say?',            9, 'The boundary between your inner life and the world · what you let in, what you keep out, who has a key', null),
  ((select id from lcp_units where name='Front Door'),       10, 'Healthy boundaries — locks and keys',       10, 'What boundaries are and are not · setting them with clarity and without guilt', null),
  ((select id from lcp_units where name='Living Room'),      11, 'What love was designed to look like',        11, null, null),
  ((select id from lcp_units where name='Living Room'),      12, 'The patterns that look like love but aren''t', 12, null, null),
  ((select id from lcp_units where name='Living Room'),      13, 'What healthy actually feels like from the inside', 13, null, null),
  ((select id from lcp_units where name='Living Room'),      14, 'The signs you are in something unhealthy',   14, null, null),
  ((select id from lcp_units where name='Living Room'),      15, 'Learning to sit together through the hard things', 15, null, null),
  ((select id from lcp_units where name='Living Room'),      16, 'Making wise decisions and building toward what is good', 16, null, null),
  ((select id from lcp_units where name='Kitchen & Dining'), 17, 'What are you feeding yourself?',            17, null, null),
  ((select id from lcp_units where name='Kitchen & Dining'), 18, 'The table we grew up at',                   18, 'Family table messages', null),
  ((select id from lcp_units where name='Kitchen & Dining'), 19, 'Setting a table worth sitting at',          19, 'Building a nourishing home', null),
  ((select id from lcp_units where name='Kitchen & Dining'), 20, 'A place at the table',                      20, 'Meal as invitation', null),
  ((select id from lcp_units where name='Bathroom'),         21, 'The mirror',                                21, 'Who do you see? · what do you believe about what you see?', null),
  ((select id from lcp_units where name='Bathroom'),         22, 'The wash',                                  22, 'Confession not as shame but as the mechanism of freedom', null),
  ((select id from lcp_units where name='Bathroom'),         23, 'Walking out clean',                         23, 'New identity · how to hold it when the old one calls', null),
  -- Phase 3 · Rest & Restoration
  ((select id from lcp_units where name='Master Bedroom'),   24, 'He makes me lie down',                      24, 'Rest as spiritual discipline', null),
  ((select id from lcp_units where name='Master Bedroom'),   25, 'The way it was meant to be',                25, 'God''s original design for sexuality', null),
  ((select id from lcp_units where name='Master Bedroom'),   26, 'Covenant, purity and moving forward',       26, 'Purity as protection of worth', null),
  ((select id from lcp_units where name='Master Bedroom'),   27, 'Healing from sexual shame — part 1',        27, 'Naming the wound', null),
  ((select id from lcp_units where name='Master Bedroom'),   28, 'Go in peace',                               28, 'From wound to freedom · the generational reach of healing', null),
  ((select id from lcp_units where name='Kids'' Bedroom'),   29, 'Who this child is',                         29, 'Child development by stage · secure attachment · the 30% repair rule', null),
  ((select id from lcp_units where name='Kids'' Bedroom'),   30, 'Not the way I was parented',                30, 'Four parenting styles · generational cycle-breaking', null),
  ((select id from lcp_units where name='Kids'' Bedroom'),   31, 'What your child is absorbing',              31, 'Safe? Loved? Capable? · home atmosphere', null),
  ((select id from lcp_units where name='Kids'' Bedroom'),   32, 'Correction that builds',                    32, 'Discipline vs. punishment · four tools', null),
  ((select id from lcp_units where name='Kids'' Bedroom'),   33, 'When children compete',                     33, 'Sibling rivalry · each child uniquely known', null),
  ((select id from lcp_units where name='Kids'' Bedroom'),   34, 'The hard days',                             34, 'Compassion fatigue · the absent other parent · holding authority alone', null),
  -- Phase 4 · Purpose & Vision
  ((select id from lcp_units where name='Office'),           35, 'You are God''s masterpiece',                35, 'Dismantling the lie · gifts inventory', null),
  ((select id from lcp_units where name='Office'),           36, 'More than a job',                           36, 'Parable of the talents · vocation vs. employment', null),
  ((select id from lcp_units where name='Office'),           37, 'Plans and a future',                        37, 'Vision statement + a 3-goal framework', null),
  ((select id from lcp_units where name='Attic'),            38, 'Going through the boxes',                   38, 'Unfinished business · four categories · attic inventory', null),
  ((select id from lcp_units where name='Attic'),            39, 'Permission to grieve',                      39, 'Grief as honest response · a private letter to what was lost', null),
  ((select id from lcp_units where name='Attic'),            40, 'Letting go',                                40, 'Acceptance vs. resignation · the bowl ceremony', null),
  ((select id from lcp_units where name='Attic'),            41, 'What outlasts you',                         41, 'Legacy as what you leave in people, not property', null),
  -- Phase 5 · Outer Life
  ((select id from lcp_units where name='Fence'),            42, 'Guard your heart',                          42, 'The inputs test · the fence as discernment, not isolation', 'Prov 4:23'),
  ((select id from lcp_units where name='Fence'),            43, 'Who you run with',                          43, 'The gravitational pull of relationships · community audit', '1 Cor 15:33'),
  ((select id from lcp_units where name='Tree in the Yard'), 44, 'Roots and seasons',                         44, 'Deep roots prevent uprooting · the wisdom of seasons', 'Jer 17:7–8'),
  ((select id from lcp_units where name='Tree in the Yard'), 45, 'Fruit and shade',                           45, 'Abiding as the condition for fruit · being shade for others', 'John 15:5 · Gal 5:22–23'),
  -- Phase 6 · Whole House & Graduation
  ((select id from lcp_units where name='Whole House'),      46, 'The inner work',                            46, 'Phases 1–2 walk-through', null),
  ((select id from lcp_units where name='Whole House'),      47, 'The personal and the purposeful',           47, 'Phases 3–4 walk-through', null),
  ((select id from lcp_units where name='Whole House'),      48, 'The whole house',                           48, 'Phase 5 walk-through · pre-graduation sending', 'Prov 13:22');

-- ─── Curriculum materials live on Google Drive (links only — see 0010_lcp_resources.sql) ──
-- No files are uploaded. When Shelly has the Drive links, add rows like the examples below.
-- Participant materials must be Drive-shared "anyone with the link" (families aren't in the
-- Workspace); staff materials stay Workspace-restricted. Left commented so the demo has no
-- broken links:
--
-- insert into lcp_resources (session_id, kind, audience, title, drive_url, created_by) values
--   (null, 'other', 'participant', 'Building Your House — Curriculum Overview',
--      'https://drive.google.com/file/d/REPLACE_ME/view', '00000000-0000-0000-0000-000000000003'),
--   ((select id from lcp_sessions where session_number=1), 'handout', 'participant', 'Foundation S1 — Student Handout',
--      'https://drive.google.com/file/d/REPLACE_ME/view', '00000000-0000-0000-0000-000000000003'),
--   ((select id from lcp_sessions where session_number=1), 'teacher_guide', 'staff', 'Foundation S1 — Teacher Guide',
--      'https://drive.google.com/file/d/REPLACE_ME/view', '00000000-0000-0000-0000-000000000003');

-- ─── Families (synthetic) ────────────────────────────────────────────
insert into families (id, display_name, login_email, status, current_session_number, joined_unit_id, housing_savings_cents) values
  ('11111111-1111-1111-1111-111111111101', 'Maria R.',    'family.maria@example.com',    'on_track',        12, (select id from lcp_units where name='Foundation'),  30000),
  ('11111111-1111-1111-1111-111111111102', 'Jasmine T.',  'family.jasmine@example.com',  'needs_attention',  7, (select id from lcp_units where name='Basement'),     10000),
  ('11111111-1111-1111-1111-111111111103', 'Brittany K.', 'family.brittany@example.com', 'onboarding',       2, (select id from lcp_units where name='Front Door'),       0);

-- ─── Program position (group is currently in Living Room — matches seed events) ──
insert into lcp_program_position (unit_id)
  select id from lcp_units where name = 'Living Room';

-- ─── This-week homework (gamified completion on the participant dashboard) ──
insert into lcp_homework (family_id, session_id, area, title, description, due_date, status, assigned_by) values
  ('11111111-1111-1111-1111-111111111101', (select id from lcp_sessions where session_number=12), 'spiritual',          'Daily gratitude journal', 'Write three things you''re grateful for each morning.', current_date + 2, 'assigned', '00000000-0000-0000-0000-000000000003'),
  ('11111111-1111-1111-1111-111111111101', (select id from lcp_sessions where session_number=12), 'relational',         'Family check-in',         'Twenty unhurried minutes with the kids — no phones.',  current_date + 2, 'complete',  '00000000-0000-0000-0000-000000000003'),
  ('11111111-1111-1111-1111-111111111101', (select id from lcp_sessions where session_number=12), 'physical_financial', 'Weekly budget worksheet', 'Fill in the spending sheet from group.',               current_date + 4, 'assigned', '00000000-0000-0000-0000-000000000003'),
  ('11111111-1111-1111-1111-111111111102', (select id from lcp_sessions where session_number=7),  'emotional',          'Triggers reflection',     'Note one moment this week you felt overwhelmed.',      current_date + 1, 'assigned', '00000000-0000-0000-0000-000000000003'),
  ('11111111-1111-1111-1111-111111111102', (select id from lcp_sessions where session_number=7),  'spiritual',          'Read Psalm 84',           'Read it twice and underline one line that stands out.',current_date + 3, 'assigned', '00000000-0000-0000-0000-000000000003'),
  ('11111111-1111-1111-1111-111111111103', (select id from lcp_sessions where session_number=2),  'general',            'Welcome packet',          'Complete the intake forms in your folder.',            current_date + 5, 'assigned', '00000000-0000-0000-0000-000000000003');

-- ─── Upcoming events (calendar; shared staff + participant) ──────────
insert into lcp_events (kind, session_id, title, starts_at, ends_at, location, mandatory, rsvp_enabled, created_by) values
  ('curriculum', (select id from lcp_sessions where session_number=13), 'Group Session — Living Room',
     date_trunc('day', now()) + interval '2 days' + interval '16 hours 15 minutes',
     date_trunc('day', now()) + interval '2 days' + interval '18 hours 15 minutes',
     'Sparrow Community Center', true, false, '00000000-0000-0000-0000-000000000003'),
  ('dinner', null, 'Sparrow Dinner',
     date_trunc('day', now()) + interval '2 days' + interval '18 hours 30 minutes',
     date_trunc('day', now()) + interval '2 days' + interval '20 hours',
     'Sparrow Community Center', false, true, '00000000-0000-0000-0000-000000000003'),
  ('one_on_one', null, 'One-on-one with Shelly',
     date_trunc('day', now()) + interval '5 days' + interval '16 hours 15 minutes',
     date_trunc('day', now()) + interval '5 days' + interval '17 hours',
     'Sparrow office', true, false, '00000000-0000-0000-0000-000000000003');

-- ─── Vouchers (Maria holds 5 unspent → can redeem 3 for a $25 gift card) ──
insert into lcp_vouchers (family_id, kind, earned_for, awarded_by)
select '11111111-1111-1111-1111-111111111101', 'gift_card', 'On-time attendance + homework', '00000000-0000-0000-0000-000000000003'
from generate_series(1, 5);
insert into lcp_vouchers (family_id, kind, earned_for, awarded_by)
select '11111111-1111-1111-1111-111111111102', 'gift_card', 'On-time attendance + homework', '00000000-0000-0000-0000-000000000003'
from generate_series(1, 2);

-- ─── A message thread for Maria (replaces Signal) ───────────────────
insert into lcp_messages (family_id, sender_kind, sender_id, body, created_at) values
  ('11111111-1111-1111-1111-111111111101', 'staff',  '00000000-0000-0000-0000-000000000003', 'Hi Maria! You did great in group this week — proud of you. 💚', now() - interval '1 day'),
  ('11111111-1111-1111-1111-111111111101', 'family', null,                                    'Thank you! The kids really loved the dinner.',                  now() - interval '20 hours'),
  ('11111111-1111-1111-1111-111111111101', 'staff',  '00000000-0000-0000-0000-000000000003', 'Wonderful. See you Thursday — your budget worksheet is due then.', now() - interval '3 hours');

-- ─── One past session + attendance, so staff history has data ────────
insert into lcp_events (id, kind, session_id, title, starts_at, ends_at, location, mandatory, created_by) values
  ('22222222-2222-2222-2222-222222222201', 'curriculum', (select id from lcp_sessions where session_number=11), 'Group Session — Living Room',
     date_trunc('day', now()) - interval '5 days' + interval '16 hours 15 minutes',
     date_trunc('day', now()) - interval '5 days' + interval '18 hours 15 minutes',
     'Sparrow Community Center', true, '00000000-0000-0000-0000-000000000003');
insert into lcp_attendance (event_id, family_id, status, marked_by) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'on_time', '00000000-0000-0000-0000-000000000003'),
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', 'late',    '00000000-0000-0000-0000-000000000003'),
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111103', 'no_show', '00000000-0000-0000-0000-000000000003');
