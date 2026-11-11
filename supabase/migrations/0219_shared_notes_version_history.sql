-- 0219: Version history for Shared Notes.
--
-- Shared Notes have been lost three times (Aug 2026 autosave-on-open bug, Oct 2026
-- stray-keystroke wipe, 2026-11-10 staff meeting notes deleted) and each save simply
-- overwrites the last, with no backups. This keeps earlier versions automatically,
-- written by the database itself, so it catches every cause: app bugs, accidental
-- deletes, someone selecting everything and typing over it.
--
-- How versions are kept small and meaningful (not one per keystroke/autosave):
--   * session: one row per burst of editing. Saves less than 10 minutes apart update
--     the same row in place (latest text, plus who edited). After a 10-minute pause
--     the next save starts a new row.
--   * before_big_removal: if a save drops the notes well below the fullest they were
--     during the current burst (40+ words gone, or at least half of 10+ words), the
--     fullest text is kept as its own version first. Catches a gradual
--     hold-backspace deletion as well as a single wipe.
--   * before_restore: when someone restores an older version, the notes as they
--     were just before are kept first, so a restore can itself be undone.
--   * before_delete: if a Shared Notes row is ever deleted outright, its last text
--     is kept (versions have no FK to the notes row, so they survive the delete).
--   * Older than 30 days: only the last session version of each day is kept, plus
--     every before_* version.
--
-- Writes happen only through the trigger and the restore function below (security
-- definer); staff can read versions but cannot edit or delete them directly.
-- Safe to re-run.

create table if not exists event_shared_notes_versions (
  id               uuid primary key default gen_random_uuid(),
  shared_note_id   uuid not null,          -- event_shared_notes.id (deliberately no FK: must survive deletes)
  event_id         uuid,                   -- for looking versions up from the meeting
  kind             text not null default 'session'
                     check (kind in ('session', 'before_big_removal', 'before_restore', 'before_delete')),
  notes            text not null default '',
  word_count       integer not null default 0,
  peak_notes       text,                   -- fullest text seen during this session (session rows only)
  peak_word_count  integer,
  editors          uuid[] not null default '{}',
  restored_from    uuid,                   -- set when this session began with a restore
  started_at       timestamptz not null default now(),
  ended_at         timestamptz not null default now()
);

create index if not exists event_shared_notes_versions_note_idx
  on event_shared_notes_versions (shared_note_id, ended_at desc);
create index if not exists event_shared_notes_versions_event_idx
  on event_shared_notes_versions (event_id, ended_at desc);

alter table event_shared_notes_versions enable row level security;

drop policy if exists "Authenticated users can view shared note versions" on event_shared_notes_versions;
create policy "Authenticated users can view shared note versions"
  on event_shared_notes_versions for select to authenticated using (true);

-- Same read-only QA access as 0217 gives on event_shared_notes itself.
drop policy if exists "readonly_user can read" on event_shared_notes_versions;
create policy "readonly_user can read" on event_shared_notes_versions
  for select to readonly_user using (true);

-- Rough word count of stored rich-text HTML.
create or replace function shared_notes_word_count(html text) returns integer
language sql immutable as $$
  select case
    when btrim(t) = '' then 0
    else coalesce(array_length(regexp_split_to_array(btrim(t), '\s+'), 1), 0)
  end
  from (
    select regexp_replace(
             regexp_replace(coalesce(html, ''), '<[^>]*>', ' ', 'g'),
             '&[a-zA-Z]+;|&#[0-9]+;', ' ', 'g') as t
  ) s
$$;

create or replace function shared_notes_is_big_removal(before_wc integer, after_wc integer) returns boolean
language sql immutable as $$
  select (before_wc - after_wc) >= 40
      or (before_wc >= 10 and after_wc * 2 <= before_wc)
$$;

create or replace function record_shared_note_version() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  latest   event_shared_notes_versions%rowtype;
  new_wc   integer := shared_notes_word_count(new.notes);
  editor   uuid := new.updated_by;
begin
  select * into latest
    from event_shared_notes_versions
   where shared_note_id = new.id
   order by ended_at desc, started_at desc
   limit 1
   for update;

  if found and latest.kind = 'session' and latest.ended_at > now() - interval '10 minutes' then
    -- Same burst of editing.
    if shared_notes_is_big_removal(coalesce(latest.peak_word_count, latest.word_count), new_wc) then
      -- Keep the fullest text from this burst as its own version, then start fresh.
      update event_shared_notes_versions
         set kind = 'before_big_removal',
             notes = coalesce(latest.peak_notes, latest.notes),
             word_count = coalesce(latest.peak_word_count, latest.word_count),
             peak_notes = null, peak_word_count = null,
             ended_at = now() - interval '1 millisecond'  -- never ties with the row that replaces it
       where id = latest.id;
      insert into event_shared_notes_versions
        (shared_note_id, event_id, notes, word_count, peak_notes, peak_word_count, editors)
      values
        (new.id, new.event_id, new.notes, new_wc, new.notes, new_wc,
         case when editor is null then '{}'::uuid[] else array[editor] end);
    else
      update event_shared_notes_versions
         set notes = new.notes,
             word_count = new_wc,
             peak_notes = case when new_wc >= coalesce(peak_word_count, 0) then new.notes else peak_notes end,
             peak_word_count = greatest(new_wc, coalesce(peak_word_count, 0)),
             editors = case when editor is null or editor = any(editors) then editors else editors || editor end,
             event_id = coalesce(new.event_id, event_id),
             ended_at = now()
       where id = latest.id;
    end if;
  else
    -- New burst. If there's no version yet for an existing row (e.g. created before
    -- this migration and missed by the backfill), keep the old text first.
    if not found and tg_op = 'UPDATE' and btrim(coalesce(old.notes, '')) <> '' then
      insert into event_shared_notes_versions
        (shared_note_id, event_id, notes, word_count, editors, started_at, ended_at)
      values
        (old.id, old.event_id, old.notes, shared_notes_word_count(old.notes),
         case when old.updated_by is null then '{}'::uuid[] else array[old.updated_by] end,
         old.updated_at, old.updated_at);
    elsif found and latest.kind = 'session'
          and shared_notes_is_big_removal(latest.word_count, new_wc) then
      -- The previous version already holds the text from right before this wipe;
      -- label it so it's easy to spot.
      update event_shared_notes_versions set kind = 'before_big_removal' where id = latest.id;
    end if;

    insert into event_shared_notes_versions
      (shared_note_id, event_id, notes, word_count, peak_notes, peak_word_count, editors)
    values
      (new.id, new.event_id, new.notes, new_wc, new.notes, new_wc,
       case when editor is null then '{}'::uuid[] else array[editor] end);

    -- Thin out: older than 30 days, keep only the last session version per day.
    delete from event_shared_notes_versions v
     where v.shared_note_id = new.id
       and v.kind = 'session'
       and v.ended_at < now() - interval '30 days'
       and exists (
         select 1 from event_shared_notes_versions v2
          where v2.shared_note_id = v.shared_note_id
            and v2.kind = 'session'
            and (v2.ended_at at time zone 'America/Los_Angeles')::date
              = (v.ended_at at time zone 'America/Los_Angeles')::date
            and v2.ended_at > v.ended_at
       );
  end if;

  return new;
end;
$$;

create or replace function record_shared_note_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if btrim(coalesce(old.notes, '')) <> '' then
    insert into event_shared_notes_versions
      (shared_note_id, event_id, kind, notes, word_count, editors, started_at, ended_at)
    values
      (old.id, old.event_id, 'before_delete', old.notes, shared_notes_word_count(old.notes),
       case when old.updated_by is null then '{}'::uuid[] else array[old.updated_by] end,
       old.updated_at, now());
  end if;
  return old;
end;
$$;

drop trigger if exists trg_shared_note_version_insert on event_shared_notes;
create trigger trg_shared_note_version_insert
  after insert on event_shared_notes
  for each row when (btrim(coalesce(new.notes, '')) <> '')
  execute function record_shared_note_version();

drop trigger if exists trg_shared_note_version_update on event_shared_notes;
create trigger trg_shared_note_version_update
  after update on event_shared_notes
  for each row when (old.notes is distinct from new.notes)
  execute function record_shared_note_version();

drop trigger if exists trg_shared_note_version_delete on event_shared_notes;
create trigger trg_shared_note_version_delete
  before delete on event_shared_notes
  for each row execute function record_shared_note_before_delete();

-- Called by the app right before it puts an older version's text back in the editor.
-- Keeps the current notes as a 'before_restore' version and starts a new session
-- version holding the restored text, labelled with where it came from.
create or replace function restore_shared_note_version(p_version_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  target  event_shared_notes_versions%rowtype;
  note    event_shared_notes%rowtype;
  latest  event_shared_notes_versions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into target from event_shared_notes_versions where id = p_version_id;
  if not found then
    raise exception 'Version not found';
  end if;

  select * into note from event_shared_notes where id = target.shared_note_id for update;

  select * into latest
    from event_shared_notes_versions
   where shared_note_id = target.shared_note_id
   order by ended_at desc, started_at desc
   limit 1
   for update;

  if found and latest.kind = 'session' then
    update event_shared_notes_versions
       set kind = 'before_restore',
           notes = coalesce(note.notes, latest.notes),
           word_count = shared_notes_word_count(coalesce(note.notes, latest.notes)),
           peak_notes = null, peak_word_count = null,
           ended_at = now() - interval '1 millisecond'  -- never ties with the restored row below
     where id = latest.id;
  elsif note.id is not null and btrim(coalesce(note.notes, '')) <> '' then
    insert into event_shared_notes_versions
      (shared_note_id, event_id, kind, notes, word_count, editors, started_at, ended_at)
    values
      (note.id, note.event_id, 'before_restore', note.notes, shared_notes_word_count(note.notes),
       case when note.updated_by is null then '{}'::uuid[] else array[note.updated_by] end,
       now() - interval '1 millisecond', now() - interval '1 millisecond');
  end if;

  insert into event_shared_notes_versions
    (shared_note_id, event_id, notes, word_count, peak_notes, peak_word_count, editors, restored_from)
  values
    (target.shared_note_id, coalesce(note.event_id, target.event_id), target.notes, target.word_count,
     target.notes, target.word_count, array[auth.uid()], target.id);
end;
$$;

revoke all on function restore_shared_note_version(uuid) from public, anon;
grant execute on function restore_shared_note_version(uuid) to authenticated;

-- Backfill: one starting version per existing note that has text.
insert into event_shared_notes_versions
  (shared_note_id, event_id, notes, word_count, editors, started_at, ended_at)
select n.id, n.event_id, n.notes, shared_notes_word_count(n.notes),
       case when n.updated_by is null then '{}'::uuid[] else array[n.updated_by] end,
       n.updated_at, n.updated_at
  from event_shared_notes n
 where btrim(coalesce(n.notes, '')) <> ''
   and not exists (select 1 from event_shared_notes_versions v where v.shared_note_id = n.id);
