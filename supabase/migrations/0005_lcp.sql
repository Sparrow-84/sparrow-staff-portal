-- Sparrow — LifeChange Program (System 1) — Phase 1 MVP schema
-- Shared backend with the Staff Portal (System 2). The participant-facing app
-- (sparrow-lcp-portal) and the staff "LCP Room" both read/write these tables.
-- Run AFTER 0004_staff_admin.sql, then run seed_lcp.sql.
--
-- Two identity worlds share one Supabase project:
--   • Staff  — Google sign-in, allowlisted by `profiles` (existing).
--   • Family — email + password, allowlisted by `families.login_email` (new).
-- handle_new_user() (replaced below) links whichever matches and rejects the rest.
--
-- LCP access tiers (brief): Full = Shelly, Audrey, Andrew · Extended = Bethany, Susanna.
-- Stored explicitly on profiles.lcp_role because it does NOT map cleanly to the
-- existing `department` column (Audrey is dept=toc but is full LCP staff; Susanna is
-- admin but only extended/no-PII for LCP). Admin role does NOT auto-grant LCP access.

-- ─── Enums ───────────────────────────────────────────────────────────
create type lcp_role         as enum ('full', 'extended');     -- staff LCP access tier
create type family_status    as enum ('onboarding', 'on_track', 'needs_attention', 'graduated');
create type event_kind       as enum ('curriculum', 'dinner', 'one_on_one', 'volunteer', 'other');
create type attendance_status as enum ('on_time', 'late', 'no_show');
create type homework_area     as enum ('relational', 'physical_financial', 'spiritual', 'emotional', 'general');
create type homework_status   as enum ('assigned', 'submitted', 'complete');
create type voucher_kind      as enum ('gift_card', 'housing');
create type redemption_status as enum ('requested', 'fulfilled', 'cancelled');
create type message_sender    as enum ('staff', 'family');

-- LCP access tier on the existing staff directory (nullable = no LCP access).
alter table profiles add column lcp_role lcp_role;

-- ─── Curriculum structure: "Building Your House" (6 phases · 14 units · 48 sessions) ──
create table lcp_phases (
  id         serial primary key,
  number     int  not null,
  name       text not null,
  sort_order int  not null
);

create table lcp_units (
  id         serial primary key,
  phase_id   int  not null references lcp_phases(id) on delete cascade,
  name       text not null,
  sort_order int  not null
);

create table lcp_sessions (
  id                    serial primary key,
  unit_id               int  not null references lcp_units(id) on delete cascade,
  session_number        int  not null,            -- 1..48 across the whole program
  title                 text not null,
  sort_order            int  not null,
  review_interval_months int not null default 12, -- staleness tracking (Curriculum Health)
  last_reviewed         date
);
create index lcp_sessions_unit_idx on lcp_sessions(unit_id);

-- ─── Families (the participant unit + the participant sign-in allowlist) ──
-- One login per family (the mother). Child tables hang off family_id.
create table families (
  id                     uuid primary key default gen_random_uuid(),
  display_name           text not null,           -- e.g. "Maria R." (synthetic in seed)
  login_email            text unique not null,    -- allowlist + sign-in identity
  auth_id                uuid unique,             -- linked to auth.users on first sign-up
  status                 family_status not null default 'onboarding',
  current_session_number int not null default 1,  -- headline progress (of 48)
  housing_savings_cents  int not null default 0,  -- perfect-month housing credit
  active                 boolean not null default true,
  created_at             timestamptz not null default now()
);

-- ─── Calendar events (curriculum sessions, dinners, one-on-ones, volunteer slots) ──
create table lcp_events (
  id           uuid primary key default gen_random_uuid(),
  kind         event_kind not null default 'other',
  session_id   int references lcp_sessions(id) on delete set null,
  title        text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  location     text,
  mandatory    boolean not null default true,
  rsvp_enabled boolean not null default false,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index lcp_events_starts_idx on lcp_events(starts_at);

-- ─── Attendance (family × event) ─────────────────────────────────────
create table lcp_attendance (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references lcp_events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  status    attendance_status not null,
  marked_by uuid references profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (event_id, family_id)
);

-- ─── Homework (family × session, tagged by goal area) ────────────────
create table lcp_homework (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references families(id) on delete cascade,
  session_id     int references lcp_sessions(id) on delete set null,
  area           homework_area not null default 'general',
  title          text not null,
  description    text,
  due_date       date,
  status         homework_status not null default 'assigned',
  submission_text text,
  submitted_at   timestamptz,
  assigned_by    uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index lcp_homework_family_idx on lcp_homework(family_id);

-- ─── Vouchers + redemptions (gift cards only — Sparrow never gives cash) ──
-- Earn: on-time mandatory session + homework = 1 voucher. 3 vouchers = $25 gift card.
create table lcp_redemptions (
  id                   uuid primary key default gen_random_uuid(),
  family_id            uuid not null references families(id) on delete cascade,
  vouchers_spent       int  not null default 3,
  gift_card_value_cents int not null default 2500,
  status               redemption_status not null default 'requested',
  requested_at         timestamptz not null default now(),
  fulfilled_by         uuid references profiles(id) on delete set null,
  fulfilled_at         timestamptz
);

create table lcp_vouchers (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  kind          voucher_kind not null default 'gift_card',
  earned_for    text,                          -- "On-time + homework · Session 12"
  earned_at     timestamptz not null default now(),
  redemption_id uuid references lcp_redemptions(id) on delete set null, -- null = unspent
  awarded_by    uuid references profiles(id) on delete set null
);
create index lcp_vouchers_family_idx on lcp_vouchers(family_id);

-- ─── Messages (one unified thread per family; replaces Signal for participant comms) ──
create table lcp_messages (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  sender_kind message_sender not null,
  sender_id   uuid references profiles(id) on delete set null, -- staff author; null when family
  body        text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index lcp_messages_family_idx on lcp_messages(family_id, created_at);

-- ─── Staff notes (internal — never visible to the participant) ───────
create table lcp_staff_notes (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  session_id int references lcp_sessions(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index lcp_staff_notes_family_idx on lcp_staff_notes(family_id);

-- ─── Sign-in linking: staff first, then family, else reject ──────────
-- Replaces the staff-only version from 0001. Staff behavior is unchanged: a
-- matching profile email links and returns. New: a matching family login_email
-- links the auth user to that family. Anything else is rejected.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.email is null then
    raise exception 'No email on account';
  end if;

  -- Staff (Google sign-in, allowlisted by profiles)
  update profiles set id = new.id, active = true
  where lower(email) = lower(new.email);
  if found then
    return new;
  end if;

  -- LifeChange family (email + password, allowlisted by families.login_email)
  update families set auth_id = new.id
  where lower(login_email) = lower(new.email) and active = true;
  if found then
    return new;
  end if;

  raise exception 'Email % is not on the Sparrow roster (staff or LifeChange family)', new.email;
end $$;

-- ─── Permission helpers (security definer so policies can read profiles/families) ──
create or replace function lcp_is_full() returns boolean
  language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and lcp_role = 'full');
$$;

create or replace function lcp_has_access() returns boolean
  language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and lcp_role in ('full', 'extended'));
$$;

-- The family id for the currently signed-in participant (null for staff).
create or replace function current_family() returns uuid
  language sql security definer set search_path = public stable as $$
  select id from families where auth_id = auth.uid();
$$;

-- ─── Row-Level Security ──────────────────────────────────────────────
alter table lcp_phases      enable row level security;
alter table lcp_units       enable row level security;
alter table lcp_sessions    enable row level security;
alter table families        enable row level security;
alter table lcp_events      enable row level security;
alter table lcp_attendance  enable row level security;
alter table lcp_homework    enable row level security;
alter table lcp_vouchers    enable row level security;
alter table lcp_redemptions enable row level security;
alter table lcp_messages    enable row level security;
alter table lcp_staff_notes enable row level security;

-- Curriculum structure: readable by any signed-in user (participants need it for the
-- progress map). Writes are full-LCP-staff only (Curriculum Admin is Shelly — Phase 2).
create policy curric_phases_read on lcp_phases for select to authenticated using (true);
create policy curric_units_read  on lcp_units  for select to authenticated using (true);
create policy curric_sess_read   on lcp_sessions for select to authenticated using (true);
create policy curric_sess_write  on lcp_sessions for all to authenticated
  using (lcp_is_full()) with check (lcp_is_full());

-- Families: a participant sees ONLY their own family; full LCP staff see all.
-- (Extended staff get no direct family/PII access in Phase 1 — their read views are Phase 2.)
create policy families_select on families for select to authenticated
  using (auth_id = auth.uid() or lcp_is_full());
create policy families_write on families for all to authenticated
  using (lcp_is_full()) with check (lcp_is_full());

-- Events (calendar): everyone with LCP access + participants can read; full staff manage.
create policy events_select on lcp_events for select to authenticated
  using (lcp_has_access() or current_family() is not null);
create policy events_write on lcp_events for all to authenticated
  using (lcp_is_full()) with check (lcp_is_full());

-- Attendance: own family reads theirs; full staff read/write all.
create policy attendance_select on lcp_attendance for select to authenticated
  using (family_id = current_family() or lcp_is_full());
create policy attendance_write on lcp_attendance for all to authenticated
  using (lcp_is_full()) with check (lcp_is_full());

-- Homework: own family reads + may submit (status/submission); full staff do anything.
create policy homework_select on lcp_homework for select to authenticated
  using (family_id = current_family() or lcp_is_full());
create policy homework_family_update on lcp_homework for update to authenticated
  using (family_id = current_family()) with check (family_id = current_family());
create policy homework_staff_write on lcp_homework for all to authenticated
  using (lcp_is_full()) with check (lcp_is_full());

-- Vouchers: own family reads; full staff award/manage.
create policy vouchers_select on lcp_vouchers for select to authenticated
  using (family_id = current_family() or lcp_is_full());
create policy vouchers_write on lcp_vouchers for all to authenticated
  using (lcp_is_full()) with check (lcp_is_full());

-- Redemptions: own family reads + may request; full staff fulfill.
create policy redemptions_select on lcp_redemptions for select to authenticated
  using (family_id = current_family() or lcp_is_full());
create policy redemptions_family_insert on lcp_redemptions for insert to authenticated
  with check (family_id = current_family() and status = 'requested');
create policy redemptions_staff_write on lcp_redemptions for all to authenticated
  using (lcp_is_full()) with check (lcp_is_full());

-- Messages: own family reads + sends (as family); full staff read/send (as staff).
create policy messages_select on lcp_messages for select to authenticated
  using (family_id = current_family() or lcp_is_full());
create policy messages_family_insert on lcp_messages for insert to authenticated
  with check (family_id = current_family() and sender_kind = 'family');
create policy messages_staff_insert on lcp_messages for insert to authenticated
  with check (lcp_is_full() and sender_kind = 'staff' and sender_id = auth.uid());
create policy messages_update_read on lcp_messages for update to authenticated
  using (family_id = current_family() or lcp_is_full())
  with check (family_id = current_family() or lcp_is_full());

-- Staff notes: full LCP staff ONLY. Never the participant, never extended staff.
create policy staff_notes_all on lcp_staff_notes for all to authenticated
  using (lcp_is_full()) with check (lcp_is_full());
