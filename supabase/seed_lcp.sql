-- Sparrow — LifeChange Program seed (SYNTHETIC data, no real participant PII).
-- Run AFTER 0005_lcp.sql and AFTER seed.sql (needs the staff profile UUIDs).
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

-- ─── Curriculum: "Building Your House" — 6 phases · 13 units · 48 sessions ──
insert into lcp_phases (number, name, sort_order) values
  (1, 'Groundwork',              1),
  (2, 'Heart of the Home',       2),
  (3, 'Rest & Restoration',      3),
  (4, 'Purpose & Vision',        4),
  (5, 'Outer Life',              5),
  (6, 'Whole House & Graduation',6);

insert into lcp_units (phase_id, name, sort_order) values
  ((select id from lcp_phases where number=1), 'Foundation',        1),
  ((select id from lcp_phases where number=1), 'Basement',          2),
  ((select id from lcp_phases where number=2), 'Front Door',        3),
  ((select id from lcp_phases where number=2), 'Living Room',       4),
  ((select id from lcp_phases where number=2), 'Kitchen & Dining',  5),
  ((select id from lcp_phases where number=2), 'Bathroom',          6),
  ((select id from lcp_phases where number=3), 'Master Bedroom',    7),
  ((select id from lcp_phases where number=3), 'Kids'' Bedroom',    8),
  ((select id from lcp_phases where number=4), 'Office',            9),
  ((select id from lcp_phases where number=4), 'Attic',            10),
  ((select id from lcp_phases where number=5), 'Fence',            11),
  ((select id from lcp_phases where number=5), 'Tree in the Yard', 12),
  ((select id from lcp_phases where number=6), 'Whole House',      13);

-- Generate the 48 sessions, numbered globally in unit order (counts per the brief).
with unit_counts(uname, cnt) as (values
    ('Foundation',4), ('Basement',4),
    ('Front Door',2), ('Living Room',6), ('Kitchen & Dining',4), ('Bathroom',3),
    ('Master Bedroom',5), ('Kids'' Bedroom',6),
    ('Office',3), ('Attic',4),
    ('Fence',2), ('Tree in the Yard',2),
    ('Whole House',3)
),
expanded as (
  select u.id as unit_id, u.name as uname, u.sort_order as unit_sort, g as local_n
  from unit_counts uc
  join lcp_units u on u.name = uc.uname
  cross join lateral generate_series(1, uc.cnt) as g
),
numbered as (
  select unit_id, uname, local_n,
         row_number() over (order by unit_sort, local_n) as global_n
  from expanded
)
insert into lcp_sessions (unit_id, session_number, title, sort_order)
select unit_id, global_n, uname || ' — Session ' || local_n, global_n
from numbered;

-- ─── Families (synthetic) ────────────────────────────────────────────
insert into families (id, display_name, login_email, status, current_session_number, housing_savings_cents) values
  ('11111111-1111-1111-1111-111111111101', 'Maria R.',    'family.maria@example.com',    'on_track',        12, 30000),
  ('11111111-1111-1111-1111-111111111102', 'Jasmine T.',  'family.jasmine@example.com',  'needs_attention',  7, 10000),
  ('11111111-1111-1111-1111-111111111103', 'Brittany K.', 'family.brittany@example.com', 'onboarding',       2,     0);

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
  ('curriculum', (select id from lcp_sessions where session_number=13), 'Group Session — Whole House',
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
  ('22222222-2222-2222-2222-222222222201', 'curriculum', (select id from lcp_sessions where session_number=11), 'Group Session — Tree in the Yard',
     date_trunc('day', now()) - interval '5 days' + interval '16 hours 15 minutes',
     date_trunc('day', now()) - interval '5 days' + interval '18 hours 15 minutes',
     'Sparrow Community Center', true, '00000000-0000-0000-0000-000000000003');
insert into lcp_attendance (event_id, family_id, status, marked_by) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'on_time', '00000000-0000-0000-0000-000000000003'),
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', 'late',    '00000000-0000-0000-0000-000000000003'),
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111103', 'no_show', '00000000-0000-0000-0000-000000000003');
