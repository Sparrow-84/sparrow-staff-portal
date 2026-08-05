-- Sparrow — LCP participant calendar sharing.
--
-- Design: LCP Team Cal becomes partially shareable with families, via a new
-- per-event "Show to LCP families" toggle, settable both at Session Cal's
-- creation form (lcp_events.lcp_family_visible, carried through the existing
-- 0114 mirror sync) and at Team Cal's own ad-hoc event form for LCP
-- (calendar_events.lcp_family_visible directly, for events with no backing
-- lcp_events row). Families only ever see title/date/time -- never notes,
-- comments, RSVP responses, or labels -- enforced by a dedicated, narrow
-- SECURITY DEFINER function (fetch_lcp_family_calendar_events), not a
-- client-side filtered select.
--
-- Bundled fix, found while scoping this, not scope creep: calendar_events'
-- read policy was `using (true)` for any authenticated user -- staff and
-- family logins are both real accounts in this one shared Supabase project,
-- so a family session could already read every department's events today,
-- nobody had just built a client that does it. Tightened to staff-only here.

create or replace function is_staff() returns boolean
  language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

alter policy calendar_select on calendar_events
  using (
    is_staff() and (not is_personal or created_by = auth.uid())
  );

alter table lcp_events add column if not exists lcp_family_visible boolean not null default false;
alter table calendar_events add column if not exists lcp_family_visible boolean not null default false;

-- Carries the flag through the existing lcp_events -> calendar_events mirror.
create or replace function sync_lcp_session_calendar_event() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.lcp_session_sync', 'true', true);
  insert into calendar_events (
    kind, title, starts_at, ends_at, all_day, location, recurrence_id,
    department, is_personal, created_by, source_system, source_ref, lcp_family_visible
  )
  values (
    'lcp_session', new.title, new.starts_at, new.ends_at, false, new.location, new.recurrence_id,
    'lcp', false, new.created_by, 'lcp_session', new.id::text, new.lcp_family_visible
  )
  on conflict (source_system, source_ref) where source_system is not null do update set
    title = excluded.title,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    location = excluded.location,
    recurrence_id = excluded.recurrence_id,
    lcp_family_visible = excluded.lcp_family_visible;
  return new;
end $$;

drop trigger if exists lcp_events_sync_calendar on lcp_events;
create trigger lcp_events_sync_calendar
  after insert or update of title, starts_at, ends_at, location, recurrence_id, lcp_family_visible on lcp_events
  for each row execute function sync_lcp_session_calendar_event();

-- Team Cal still can't change a mirrored session's identity fields -- now
-- including family visibility, same reasoning as title/time/location.
create or replace function guard_lcp_session_calendar_event() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.lcp_session_sync', true) = 'true' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.source_system = 'lcp_session' then
      raise exception 'This session can only be deleted from the LCP Session Cal.';
    end if;
    return old;
  end if;
  if old.source_system = 'lcp_session' and (
    new.title is distinct from old.title or
    new.starts_at is distinct from old.starts_at or
    new.ends_at is distinct from old.ends_at or
    new.location is distinct from old.location or
    new.lcp_family_visible is distinct from old.lcp_family_visible
  ) then
    raise exception 'Title, time, location, and family visibility for this session can only be changed from the LCP Session Cal.';
  end if;
  return new;
end $$;

-- Backfill: existing sessions default to not-visible (false), matching the
-- column default -- nothing needs updating, this is just documenting the
-- deliberate choice not to retroactively flip anything on.

create or replace function fetch_lcp_family_calendar_events() returns table(
  id uuid, title text, starts_at timestamptz, ends_at timestamptz
)
  language sql security definer set search_path = public stable as $$
  select id, title, starts_at, ends_at
  from calendar_events
  where department = 'lcp' and lcp_family_visible = true;
$$;

grant execute on function fetch_lcp_family_calendar_events() to authenticated;
