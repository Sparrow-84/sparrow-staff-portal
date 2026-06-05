-- Sparrow Staff Portal — Sequence 1 "Spine" dev seed (SYNTHETIC data, no real PII).
-- Run AFTER 0006_spine.sql (and the staff seed.sql, which creates the profiles).
--
-- Recurring meeting cadences are anchored to the CURRENT week's Monday so the
-- calendar + "Upcoming meetings" widget always demo well. date_trunc('week', …)
-- returns Monday 00:00; we add weekday + time offsets from there.

-- ─── Recurring meeting cadences (from Susanna's System Brief) ─────────
insert into calendar_events (kind, title, starts_at, ends_at, location, recurrence, department, created_by) values
  ('meeting', 'All-staff meeting',
     date_trunc('week', current_date) + interval '2 day' + interval '14 hour',
     date_trunc('week', current_date) + interval '2 day' + interval '15 hour',
     'Office', 'weekly', 'ops', '00000000-0000-0000-0000-000000000002'),
  ('meeting', 'Andrew + Susanna — ops sync',
     date_trunc('week', current_date) + interval '2 day' + interval '12 hour',
     date_trunc('week', current_date) + interval '2 day' + interval '12 hour 30 minute',
     null, 'weekly', 'ops', '00000000-0000-0000-0000-000000000002'),
  ('meeting', 'Susanna + Audrey — touchpoint',
     date_trunc('week', current_date) + interval '2 day' + interval '13 hour 40 minute',
     null, null, 'weekly', 'ops', '00000000-0000-0000-0000-000000000002'),
  ('meeting', 'Susanna + Lindy — touchpoint',
     date_trunc('week', current_date) + interval '1 day' + interval '9 hour 45 minute',
     null, null, 'weekly', 'toc', '00000000-0000-0000-0000-000000000002'),
  ('meeting', 'Susanna + Bethany — call (as needed)',
     date_trunc('week', current_date) + interval '11 hour',
     null, null, 'weekly', 'partnerships', '00000000-0000-0000-0000-000000000002'),
  ('lcp_session', 'LCP — individual participant meetings',
     date_trunc('week', current_date) + interval '16 hour 15 minute',
     date_trunc('week', current_date) + interval '18 hour 15 minute',
     'LifeChange room', 'weekly', 'lcp', '00000000-0000-0000-0000-000000000003'),
  ('lcp_session', 'LCP — group session',
     date_trunc('week', current_date) + interval '3 day' + interval '16 hour 15 minute',
     date_trunc('week', current_date) + interval '3 day' + interval '18 hour 15 minute',
     'LifeChange room', 'weekly', 'lcp', '00000000-0000-0000-0000-000000000003'),
  ('meeting', 'Sparrow dinner (after group)',
     date_trunc('week', current_date) + interval '3 day' + interval '18 hour 30 minute',
     date_trunc('week', current_date) + interval '3 day' + interval '20 hour',
     'LifeChange room', 'biweekly', 'lcp', '00000000-0000-0000-0000-000000000003');

-- A one-off closure + an OOO, so the calendar shows non-recurring kinds too.
insert into calendar_events (kind, title, starts_at, all_day, recurrence, created_by) values
  ('closure', 'Office closed — staff retreat',
     date_trunc('week', current_date) + interval '7 day' + interval '9 hour', true, null,
     '00000000-0000-0000-0000-000000000001'),
  ('ooo', 'Bethany away',
     date_trunc('week', current_date) + interval '9 day' + interval '9 hour', true, null,
     '00000000-0000-0000-0000-000000000004');

-- ─── Quick Wins (normally emitted by the system; seeded here to demo the feed) ──
insert into quick_wins (kind, title, detail, subject_id) values
  ('newsletter', 'June newsletter published', 'TSM June community update went out to all partners.', '00000000-0000-0000-0000-000000000004'),
  ('lcp_onboarded', 'New LifeChange family onboarded', 'Welcome added to the cohort this week.', '00000000-0000-0000-0000-000000000003');

-- ─── Demo: a personalized Home layout for Andrew (TOC-forward, per the brief) ──
insert into user_settings (user_id, home_layout, values_footer_enabled) values
  ('00000000-0000-0000-0000-000000000001',
   '["today_tasks","upcoming_meetings","notifications","quick_wins"]'::jsonb, true)
on conflict (user_id) do nothing;
