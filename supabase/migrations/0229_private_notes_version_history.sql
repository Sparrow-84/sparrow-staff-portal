-- 0229: Version history for private Prep Notes and Live Notes (meeting_notes).
--
-- Shared Notes got version history in 0219. The private Prep/Live notes had none:
-- each save overwrites the last, so if someone selected everything and typed over
-- it, or an app bug saved blank text, there was nothing to restore from.
--
-- Same rules as 0219, kept separately for Prep and for Live:
--   * session: one row per burst of editing; saves under 10 minutes apart update it.
--   * before_big_removal: the fullest text from the burst is kept on its own when
--     40+ words, or at least half of 10+ words, are removed.
--   * before_restore: the text just before a restore is kept, so a restore can be undone.
--   * before_delete: if the notes row is deleted outright, its last text is kept.
--   * Older than 30 days: only the last session version per day is kept, plus every before_* copy.
--
-- Private stays private: each person can read only their own versions. Writes happen
-- only through the trigger and restore function (security definer). Reuses
-- shared_notes_word_count() and shared_notes_is_big_removal() from 0219.
-- Safe to re-run.

create table if not exists meeting_notes_versions (
  id               uuid primary key default gen_random_uuid(),
  meeting_note_id  uuid not null,          -- meeting_notes.id (deliberately no FK: must survive deletes)
  event_id         uuid,
  user_id          uuid not null,          -- whose private notes these are
  field            text not null check (field in ('prep', 'live')),
  kind             text not null default 'session'
                     check (kind in ('session', 'before_big_removal', 'before_restore', 'before_delete')),
  notes            text not null default '',
  word_count       integer not null default 0,
  peak_notes       text,
  peak_word_count  integer,
  restored_from    uuid,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz not null default now()
);

create index if not exists meeting_notes_versions_note_idx
  on meeting_notes_versions (meeting_note_id, field, ended_at desc);
create index if not exists meeting_notes_versions_user_event_idx
  on meeting_notes_versions (user_id, event_id, field, ended_at desc);

alter table meeting_notes_versions enable row level security;

drop policy if exists "Owner can view own private note versions" on meeting_notes_versions;
create policy "Owner can view own private note versions"
  on meeting_notes_versions for select to authenticated using (user_id = auth.uid());

-- Same read-only QA access readonly_user already has on meeting_notes itself.
drop policy if exists "readonly_user can read" on meeting_notes_versions;
create policy "readonly_user can read" on meeting_notes_versions
  for select to readonly_user using (true);

-- One field (prep or live) of one notes row changed: record it.
create or replace function record_meeting_note_field_version(
  p_note_id uuid, p_event_id uuid, p_user_id uuid, p_field text,
  p_old_text text, p_new_text text, p_old_at timestamptz, p_is_update boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  latest  meeting_notes_versions%rowtype;
  new_wc  integer := shared_notes_word_count(p_new_text);
begin
  select * into latest
    from meeting_notes_versions
   where meeting_note_id = p_note_id and field = p_field
   order by ended_at desc, started_at desc
   limit 1
   for update;

  if found and latest.kind = 'session' and latest.ended_at > now() - interval '10 minutes' then
    if shared_notes_is_big_removal(coalesce(latest.peak_word_count, latest.word_count), new_wc) then
      update meeting_notes_versions
         set kind = 'before_big_removal',
             notes = coalesce(latest.peak_notes, latest.notes),
             word_count = coalesce(latest.peak_word_count, latest.word_count),
             peak_notes = null, peak_word_count = null,
             ended_at = now() - interval '1 millisecond'
       where id = latest.id;
      insert into meeting_notes_versions
        (meeting_note_id, event_id, user_id, field, notes, word_count, peak_notes, peak_word_count)
      values
        (p_note_id, p_event_id, p_user_id, p_field, p_new_text, new_wc, p_new_text, new_wc);
    else
      update meeting_notes_versions
         set notes = p_new_text,
             word_count = new_wc,
             peak_notes = case when new_wc >= coalesce(peak_word_count, 0) then p_new_text else peak_notes end,
             peak_word_count = greatest(new_wc, coalesce(peak_word_count, 0)),
             event_id = coalesce(p_event_id, event_id),
             ended_at = now()
       where id = latest.id;
    end if;
  else
    if not found and p_is_update and btrim(coalesce(p_old_text, '')) <> '' then
      -- No version yet for an existing row (missed by the backfill): keep the old text first.
      insert into meeting_notes_versions
        (meeting_note_id, event_id, user_id, field, notes, word_count, started_at, ended_at)
      values
        (p_note_id, p_event_id, p_user_id, p_field, p_old_text, shared_notes_word_count(p_old_text),
         coalesce(p_old_at, now()) - interval '1 millisecond', coalesce(p_old_at, now()) - interval '1 millisecond');
    elsif found and latest.kind = 'session'
          and shared_notes_is_big_removal(latest.word_count, new_wc) then
      update meeting_notes_versions set kind = 'before_big_removal' where id = latest.id;
    end if;

    insert into meeting_notes_versions
      (meeting_note_id, event_id, user_id, field, notes, word_count, peak_notes, peak_word_count)
    values
      (p_note_id, p_event_id, p_user_id, p_field, p_new_text, new_wc, p_new_text, new_wc);

    delete from meeting_notes_versions v
     where v.meeting_note_id = p_note_id
       and v.field = p_field
       and v.kind = 'session'
       and v.ended_at < now() - interval '30 days'
       and exists (
         select 1 from meeting_notes_versions v2
          where v2.meeting_note_id = v.meeting_note_id
            and v2.field = v.field
            and v2.kind = 'session'
            and (v2.ended_at at time zone 'America/Los_Angeles')::date
              = (v.ended_at at time zone 'America/Los_Angeles')::date
            and v2.ended_at > v.ended_at
       );
  end if;
end;
$$;

revoke all on function record_meeting_note_field_version(uuid, uuid, uuid, text, text, text, timestamptz, boolean) from public, anon, authenticated;

create or replace function record_meeting_note_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if btrim(coalesce(new.prep_notes, '')) <> '' then
      perform record_meeting_note_field_version(new.id, new.event_id, new.user_id, 'prep', null, new.prep_notes, null, false);
    end if;
    if btrim(coalesce(new.live_notes, '')) <> '' then
      perform record_meeting_note_field_version(new.id, new.event_id, new.user_id, 'live', null, new.live_notes, null, false);
    end if;
  else
    if old.prep_notes is distinct from new.prep_notes then
      perform record_meeting_note_field_version(new.id, new.event_id, new.user_id, 'prep', old.prep_notes, new.prep_notes, old.updated_at, true);
    end if;
    if old.live_notes is distinct from new.live_notes then
      perform record_meeting_note_field_version(new.id, new.event_id, new.user_id, 'live', old.live_notes, new.live_notes, old.updated_at, true);
    end if;
  end if;
  return new;
end;
$$;

create or replace function record_meeting_note_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if btrim(coalesce(old.prep_notes, '')) <> '' then
    insert into meeting_notes_versions
      (meeting_note_id, event_id, user_id, field, kind, notes, word_count, started_at, ended_at)
    values
      (old.id, old.event_id, old.user_id, 'prep', 'before_delete', old.prep_notes,
       shared_notes_word_count(old.prep_notes), old.updated_at, now());
  end if;
  if btrim(coalesce(old.live_notes, '')) <> '' then
    insert into meeting_notes_versions
      (meeting_note_id, event_id, user_id, field, kind, notes, word_count, started_at, ended_at)
    values
      (old.id, old.event_id, old.user_id, 'live', 'before_delete', old.live_notes,
       shared_notes_word_count(old.live_notes), old.updated_at, now());
  end if;
  return old;
end;
$$;

drop trigger if exists trg_meeting_note_version_insert on meeting_notes;
create trigger trg_meeting_note_version_insert
  after insert on meeting_notes
  for each row execute function record_meeting_note_version();

drop trigger if exists trg_meeting_note_version_update on meeting_notes;
create trigger trg_meeting_note_version_update
  after update on meeting_notes
  for each row when (old.prep_notes is distinct from new.prep_notes or old.live_notes is distinct from new.live_notes)
  execute function record_meeting_note_version();

drop trigger if exists trg_meeting_note_version_delete on meeting_notes;
create trigger trg_meeting_note_version_delete
  before delete on meeting_notes
  for each row execute function record_meeting_note_before_delete();

-- Called by the app right before it puts an older version back. Only the owner of
-- the notes can restore. Keeps the current text as 'before_restore', then starts a
-- new session version holding the restored text.
create or replace function restore_meeting_note_version(p_version_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  target   meeting_notes_versions%rowtype;
  note     meeting_notes%rowtype;
  latest   meeting_notes_versions%rowtype;
  cur_text text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into target from meeting_notes_versions where id = p_version_id;
  if not found or target.user_id <> auth.uid() then
    raise exception 'Version not found';
  end if;

  select * into note from meeting_notes where id = target.meeting_note_id for update;
  cur_text := case target.field when 'prep' then note.prep_notes else note.live_notes end;

  select * into latest
    from meeting_notes_versions
   where meeting_note_id = target.meeting_note_id and field = target.field
   order by ended_at desc, started_at desc
   limit 1
   for update;

  if found and latest.kind = 'session' then
    update meeting_notes_versions
       set kind = 'before_restore',
           notes = coalesce(cur_text, latest.notes),
           word_count = shared_notes_word_count(coalesce(cur_text, latest.notes)),
           peak_notes = null, peak_word_count = null,
           ended_at = now() - interval '1 millisecond'
     where id = latest.id;
  elsif note.id is not null and btrim(coalesce(cur_text, '')) <> '' then
    insert into meeting_notes_versions
      (meeting_note_id, event_id, user_id, field, kind, notes, word_count, started_at, ended_at)
    values
      (note.id, note.event_id, note.user_id, target.field, 'before_restore', cur_text,
       shared_notes_word_count(cur_text), now() - interval '1 millisecond', now() - interval '1 millisecond');
  end if;

  insert into meeting_notes_versions
    (meeting_note_id, event_id, user_id, field, notes, word_count, peak_notes, peak_word_count, restored_from)
  values
    (target.meeting_note_id, coalesce(note.event_id, target.event_id), target.user_id, target.field,
     target.notes, target.word_count, target.notes, target.word_count, target.id);
end;
$$;

revoke all on function restore_meeting_note_version(uuid) from public, anon;
grant execute on function restore_meeting_note_version(uuid) to authenticated;

-- Backfill: one starting version per existing Prep and Live note that has text.
insert into meeting_notes_versions
  (meeting_note_id, event_id, user_id, field, notes, word_count, started_at, ended_at)
select n.id, n.event_id, n.user_id, 'prep', n.prep_notes, shared_notes_word_count(n.prep_notes), n.updated_at, n.updated_at
  from meeting_notes n
 where btrim(coalesce(n.prep_notes, '')) <> ''
   and not exists (select 1 from meeting_notes_versions v where v.meeting_note_id = n.id and v.field = 'prep');

insert into meeting_notes_versions
  (meeting_note_id, event_id, user_id, field, notes, word_count, started_at, ended_at)
select n.id, n.event_id, n.user_id, 'live', n.live_notes, shared_notes_word_count(n.live_notes), n.updated_at, n.updated_at
  from meeting_notes n
 where btrim(coalesce(n.live_notes, '')) <> ''
   and not exists (select 1 from meeting_notes_versions v where v.meeting_note_id = n.id and v.field = 'live');
