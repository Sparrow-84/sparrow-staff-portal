-- Sparrow Staff Portal (System 2) — Sequence 1 "Spine"
-- Turns Slice 1 (tasks + Twin Oaks Room) into the parent hub the rooms plug into:
--   • Cross-system task API  — rooms emit/resolve tasks against System 2 (dedup-safe)
--   • Triage Inbox           — assigned tasks land "pending" until the recipient accepts
--   • Customizable Home       — per-user widget layout (user_settings)
--   • Quick Wins             — auto-generated celebration feed
--   • Calendar foundation    — team calendar events (+ recurrence)
--   • Notification linking    — generic entity pointer for room click-through
-- Run AFTER 0005_lcp.sql, then run seed_spine.sql.

-- ─── Enums ───────────────────────────────────────────────────────────
create type triage_status  as enum ('pending', 'accepted');
create type quick_win_kind as enum ('lcp_onboarded', 'lcp_phase', 'grant_submitted', 'newsletter', 'procedure', 'custom');
create type calendar_kind  as enum ('meeting', 'closure', 'holiday', 'ooo', 'lcp_session', 'toc', 'other');

-- ─── Cross-system task source + Triage ───────────────────────────────
-- A task can originate in System 2 (a person creates it) or be emitted by a room
-- (LCP overdue homework, CRM cadence due, TOC issue reported). Room-emitted tasks
-- carry a stable (source_system, source_ref) key so re-emitting updates instead of
-- duplicating. created_by becomes nullable: system-generated tasks have no human author.
alter table tasks add column triage_status triage_status not null default 'accepted';
alter table tasks add column source_system text;   -- 'lcp' | 'crm' | 'toc' | null (created in System 2)
alter table tasks add column source_ref    text;   -- room-stable key, e.g. 'homework:<uuid>'
alter table tasks alter column created_by drop not null;

create unique index tasks_source_uniq on tasks(source_system, source_ref)
  where source_system is not null;
create index tasks_triage_idx on tasks(assignee_id, triage_status);

-- Assigned work lands in the recipient's Triage Inbox (pending) rather than directly
-- on their day. Self-created/self-assigned work is accepted immediately. Room-emitted
-- work (created_by null) is always triaged so nothing appears silently.
create or replace function set_task_triage() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.created_by is null or NEW.assignee_id is distinct from NEW.created_by then
      NEW.triage_status := 'pending';
    else
      NEW.triage_status := 'accepted';
    end if;
  elsif NEW.assignee_id is distinct from OLD.assignee_id then
    -- reassignment ("Assign to…"): triage for the new owner unless they did it themselves
    NEW.triage_status := case when NEW.assignee_id is distinct from auth.uid()
                              then 'pending' else 'accepted' end;
  end if;
  return NEW;
end $$;

create trigger task_triage before insert or update on tasks
  for each row execute function set_task_triage();

-- Rooms call these (from their own triggers or service code). SECURITY DEFINER so a
-- room write can create a System-2 task even though the actor isn't the assignee.
create or replace function emit_system_task(
  p_system     text,
  p_ref        text,
  p_assignee   uuid,
  p_title      text,
  p_department department default 'ops',
  p_priority   priority    default 'p3',
  p_due        date        default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare existing uuid;
begin
  update tasks
     set title = p_title, due_date = p_due, priority = p_priority,
         department = p_department, updated_at = now()
   where source_system = p_system and source_ref = p_ref
   returning id into existing;
  if existing is not null then
    return existing;                            -- already emitted → updated in place
  end if;

  insert into tasks (title, due_date, department, priority, assignee_id,
                     created_by, source_system, source_ref)
  values (p_title, p_due, p_department, p_priority, p_assignee,
          null, p_system, p_ref)
  returning id into existing;
  return existing;
end $$;

-- Source condition cleared (homework submitted, issue resolved): close the task.
create or replace function resolve_system_task(p_system text, p_ref text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update tasks set status = 'done', updated_at = now()
   where source_system = p_system and source_ref = p_ref and status <> 'done';
end $$;

-- ─── Notification linking (room click-through) ───────────────────────
-- Existing notifications point at a task_id. Rooms surface non-task records too, so
-- add a generic pointer the client uses to route to the right screen.
alter table notifications add column entity    text;   -- 'task' | 'family' | 'work_order' | …
alter table notifications add column entity_id uuid;

-- ─── Per-user settings (customizable Home + ambient values footer) ───
create table user_settings (
  user_id               uuid primary key references profiles(id) on delete cascade,
  home_layout           jsonb,                       -- ordered array of widget keys; null = default
  values_footer_enabled boolean not null default true,
  prefs                 jsonb   not null default '{}'::jsonb,
  updated_at            timestamptz not null default now()
);

alter table user_settings enable row level security;
create policy settings_own on user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger user_settings_updated_at before update on user_settings
  for each row execute function set_updated_at();

-- ─── Quick Wins (auto-generated celebration feed) ────────────────────
-- "Staff should never manually log a win" — wins are emitted by the system when
-- significant events complete. Staff may optionally annotate one.
create table quick_wins (
  id         uuid primary key default gen_random_uuid(),
  kind       quick_win_kind not null default 'custom',
  title      text not null,
  detail     text,
  subject_id uuid references profiles(id) on delete set null,   -- who/what it's about
  note       text,                                              -- optional staff add-on
  created_at timestamptz not null default now()
);
create index quick_wins_created_idx on quick_wins(created_at desc);

alter table quick_wins enable row level security;
-- Wins are celebratory and non-sensitive: every signed-in staff member sees them and
-- may add a note. No client INSERT — only the definer emitter below creates wins.
create policy quick_wins_select on quick_wins for select to authenticated using (true);
create policy quick_wins_note   on quick_wins for update to authenticated
  using (true) with check (true);

create or replace function emit_quick_win(
  p_kind quick_win_kind, p_title text, p_detail text default null, p_subject uuid default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into quick_wins (kind, title, detail, subject_id)
  values (p_kind, p_title, p_detail, p_subject)
  returning id into new_id;
  return new_id;
end $$;

-- ─── Calendar foundation (team calendar; rooms read/write their own kinds) ──
create table calendar_events (
  id          uuid primary key default gen_random_uuid(),
  kind        calendar_kind not null default 'meeting',
  title       text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  location    text,
  recurrence  text,                       -- null | 'weekly' | 'biweekly' (weekday/time from starts_at)
  department  department,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index calendar_events_starts_idx on calendar_events(starts_at);

alter table calendar_events enable row level security;
-- Everyone signed in sees the team calendar. Staff may add events (e.g. their OOO);
-- you edit/remove your own, admins edit anything.
create policy calendar_select on calendar_events for select to authenticated using (true);
create policy calendar_insert on calendar_events for insert to authenticated
  with check (created_by = auth.uid());
create policy calendar_update on calendar_events for update to authenticated
  using (created_by = auth.uid() or is_admin()) with check (created_by = auth.uid() or is_admin());
create policy calendar_delete on calendar_events for delete to authenticated
  using (created_by = auth.uid() or is_admin());
